# Analisi Stallo Generazione Libri

> **Stato:** NON RISOLTO
> **Ultimo aggiornamento:** 2026-03-27 12:10
> **Priorita:** Bloccante pre-produzione

## Obiettivo
Completare la generazione del libro in modo affidabile, idempotente e recuperabile, garantendo che il sistema completi solo le parti mancanti senza rigenerare capitoli gia conclusi e senza lasciare paragrafi orfani in stato `PENDING`.

---

## Executive Summary
Il problema non e solo "manca il paragrafo 10". Il flusso attuale consente un falso positivo di successo:

- il backend considera conclusa la chiamata al worker anche se il worker restituisce solo una parte dei paragrafi attesi;
- n8n oggi accetta output parziali nel nodo `Sanitize Chapter JSON` e prosegue comunque con il salvataggio;
- il meccanismo di deduplica degli `ai_requests` non distingue le due meta dello stesso capitolo e quindi non e sicuro per la split generation parallela.

Per andare in produzione in sicurezza serve trasformare il contratto `WRITE_CHAPTER_FROM_PLAN` da "best effort" a "strict contract", con validazione server-side e worker-side, retry mirato sui paragrafi mancanti, osservabilita esplicita e un rollout a basso rischio.

---

## Stato Attuale

### Libro osservato
| Capitolo | Status | Paragrafi |
|----------|--------|-----------|
| 1 | COMPLETED | 10/10 |
| 2 | COMPLETED | 10/10 |
| 3 | COMPLETED | 10/10 |
| 4 | COMPLETED | 10/10 |
| 5 | PENDING | 9/10, manca `paragraph_number = 10` |

### Sintomo applicativo
- UI: `Chapter 5 is still incomplete after chapter generation`
- UI: `4 / 5 capitoli completati`
- Run: `write_chapter`
- Stato: `failed`

### Stato DB rilevato
- Paragrafi 1-9 del capitolo 5: `COMPLETED` con contenuto presente
- Paragrafo 10 del capitolo 5: `PENDING`, `content = null`

### Validazione DB del 2026-03-27
La verifica diretta su Supabase conferma in modo netto il comportamento anomalo:

- per il capitolo 5 (`chapter_id = 8ae4b7ce-2b29-4065-94b9-007b6b74dab6`) le richieste `partNumber = 2`, `paragraphRange = [6,10]` hanno restituito piu volte solo `6,7,8,9`;
- esiste anche un caso precedente in cui la stessa meta del capitolo ha restituito `0` paragrafi ma la request risulta comunque `completed`;
- esiste un caso su un altro capitolo in cui `partNumber = 1`, `paragraphRange = [1,5]` ha restituito `1,2,3,4,5,6`, quindi il sistema oggi accetta anche output fuori range e sovra-copertura;
- nei log non emerge invece una collisione concreta di deduplica per questo incidente specifico: le due richieste parallele sono state entrambe create, inviate e completate con request id distinti.

Conclusione operativa:
- la falla primaria da correggere subito e il contract enforcement del worker;
- la deduplica resta un hardening necessario, ma non e il root cause dimostrato del caso capitolo 5.

---

## Problemi Gia Corretti

### 1. Reset ingiustificati dei capitoli gia validi
- **Esito:** risolto
- **Nota:** in `server/index.cjs` e stata introdotta tolleranza sul conteggio paragrafi per evitare reset impropri di capitoli gia chiusi.

### 2. Chiusura capitolo troppo permissiva lato workflow
- **Esito:** parzialmente risolto
- **Nota:** in `n8n/workflows/w4u_workflow.json` il `COMPLETED` del capitolo ora richiede che tutti i paragrafi siano effettivamente conclusi.
- **Limite residuo:** la chiusura del capitolo e stata rafforzata, ma il worker continua ad accettare e persistire output parziali.

---

## Evidenze Tecniche Dal Codice

### Evidenza A. Il worker n8n accetta output parziali
Nel nodo `Sanitize Chapter JSON` di [w4u_workflow.json](C:\Users\genco\Desktop\lavoro\w4uN8N\n8n\workflows\w4u_workflow.json) viene fatto questo comportamento:

- legge `expectedParagraphs`;
- normalizza l'output del modello;
- se il numero di paragrafi restituiti e diverso dall'atteso, scrive solo un warning e prosegue comunque.

Effetto pratico:
- se il modello restituisce 4 paragrafi invece di 5 per il range `6-10`, il workflow salva quei 4;
- n8n risponde comunque `status: completed`;
- il backend scopre il problema solo dopo, quando `finalizeChapterIfReady()` vede che il capitolo e ancora incompleto.

Questa e la causa piu probabile del falso positivo operativo.

### Evidenza B. La deduplica server non e compatibile con la split generation parallela
In [index.cjs](C:\Users\genco\Desktop\lavoro\w4uN8N\server\index.cjs) la funzione `createAiRequestAndWait()` deduplica per:

- `book_id`
- `action`
- `chapterId`

ma non include:

- `paragraphRange`
- `partNumber`
- `targetWordCount`

Nel punto in cui `processCurrentChapter()` lancia in parallelo due `WRITE_CHAPTER_FROM_PLAN`, entrambe le richieste condividono lo stesso `chapterId`.

Rischio concreto:
- una meta puo riusare la richiesta dell'altra;
- lo stato puo diventare ambiguo nei retry;
- la piattaforma non ha una chiave idempotente affidabile per distinguere `parte 1` e `parte 2`.

Dai log consultati questa vulnerabilita non risulta la causa materiale del caso osservato, ma resta un rischio architetturale da chiudere prima del go-live.

### Evidenza C. Il worker accetta anche output fuori range
Dalla lettura delle `ai_requests` emerge un caso in cui:

- `partNumber = 1`
- `paragraphRange = [1,5]`
- `returnedNumbers = [1,2,3,4,5,6]`

Questo significa che oggi il sistema non valida solo la cardinalita, ma neppure l'esatta appartenenza al range richiesto.

Implicazione:
- il bug non e limitato al "missing paragraph";
- esiste anche il rischio di sovrascrivere contenuti o contaminare la meta successiva del capitolo.

### Evidenza D. La gestione dell'incompletezza arriva troppo tardi
Il backend:

- lancia le due meta del capitolo;
- aspetta il completamento delle due `ai_requests`;
- prova `finalizeChapterIfReady()`;
- se anche un solo paragrafo manca, fallisce con `Chapter X is still incomplete after chapter generation`.

Questa gestione e corretta come gate finale, ma manca un livello intermedio:

- identificazione dei paragrafi mancanti;
- retry mirato del solo set incompleto;
- logging strutturato del delta tra atteso e scritto.

---

## Root Cause Più Probabile

### Root cause primaria
`WRITE_CHAPTER_FROM_PLAN` non e contrattualmente rigido: il worker puo restituire meno paragrafi del range richiesto e il workflow n8n considera comunque la request completata.

### Root cause secondaria
Il prompt e il worker non impongono una corrispondenza esatta tra `paragraphRange` richiesto e `paragraph_number` restituiti, quindi il modello puo omettere o aggiungere elementi senza far fallire il task.

### Root cause sistemica
L'orchestrazione non ha ancora un meccanismo first-class di "partial completion recovery". Quando manca 1 paragrafo su 10, il sistema sa solo fallire il capitolo, non completarlo in modo chirurgico.

### Root cause di hardening
La deduplica delle richieste AI non e ancora disegnata in modo ottimale per supportare nel tempo due richieste parallele sullo stesso capitolo.

---

## Impatto Su Produzione

### Impatto utente
- il prodotto mostra progresso quasi completo ma si ferma nell'ultimo miglio;
- l'utente percepisce il sistema come instabile e non deterministico;
- il messaggio di errore e tecnico ma non operativamente risolutivo.

### Impatto operativo
- retry manuali possono ripetere costo LLM senza garanzia di convergenza;
- si accumulano run fallite con stato dati parzialmente scritto;
- aumentano i casi di supporto difficili da diagnosticare.

### Impatto business
- rischio elevato per un servizio a pagamento vicino alla produzione;
- bassa fiducia nel pulsante `Elabora Tutto`;
- rischio di libri incompleti o processi bloccati senza recovery automatica.

---

## Piano Di Risoluzione

## Fase 1. Stop ai falsi positivi del worker
**Obiettivo:** nessuna `WRITE_CHAPTER_FROM_PLAN` deve risultare `completed` se non copre esattamente il range richiesto.

### Interventi
- Rendere `Sanitize Chapter JSON` fail-fast:
  - se `normalized.length !== expectedParagraphs`, lanciare errore invece di fare solo warning;
  - verificare che i `paragraph_number` restituiti coincidano esattamente con il range richiesto;
  - fallire se manca anche un solo numero atteso;
  - fallire se compare un numero fuori range.
- Aggiungere nel payload n8n la lista esplicita dei `expectedParagraphNumbers`, non solo il conteggio.
- Rafforzare il prompt del writer:
  - esplicitare che i numeri fuori range invalidano la risposta;
  - esplicitare che omissioni o extra rendono la risposta inutilizzabile;
  - chiedere un elemento esatto per ogni numero atteso.
- Aggiornare la risposta del worker per includere:
  - `expectedParagraphNumbers`
  - `returnedParagraphNumbers`
  - `missingParagraphNumbers`
  - `extraParagraphNumbers`

### Esito atteso
- l'errore viene rilevato nel punto giusto;
- niente salvataggi parziali mascherati da successo;
- debugging immediato del mismatch.

## Fase 2. Correggere l'idempotenza della split generation
**Obiettivo:** rendere sicure e distinguibili le due meta del capitolo.

### Interventi
- Estendere la deduplica di `createAiRequestAndWait()` con una chiave logica completa:
  - `bookId`
  - `action`
  - `chapterId`
  - `partNumber`
  - `paragraphRange`
- Scrivere questa chiave anche in `request_payload` o `metadata` come `request_signature`.
- Rifiutare il riuso di una request pendente se la signature non e identica.
- Facoltativo ma consigliato: aggiungere un indice o una convenzione queryable per auditing delle signature.

### Esito atteso
- niente collisioni tra parte 1 e parte 2;
- retry ripetibili;
- comportamento idempotente e debuggabile.

## Fase 3. Retry mirato sui paragrafi mancanti
**Obiettivo:** non rigenerare l'intero capitolo quando manca solo una parte.

### Interventi
- Dopo il primo passaggio di scrittura, il backend deve rilevare i paragrafi mancanti:
  - `status != COMPLETED`
  - `content is null`
  - `content.length <= soglia`
- Se il set mancante e non vuoto:
  - eseguire un retry mirato solo su quei paragrafi;
  - limitare i retry automatici a 1 o 2 tentativi;
  - mantenere log del motivo del retry.
- Se il retry sul range originario fallisce ancora:
  - degradare a un retry ancora piu chirurgico per il sottoinsieme esatto mancante;
  - esempio: da `[6,10]` con mancante `10`, rilanciare `[10,10]`.
- Se dopo il retry restano buchi:
  - chiudere il run in `failed`;
  - esporre in `last_error` i numeri dei paragrafi mancanti;
  - lasciare il capitolo in uno stato esplicitamente recuperabile.

### Esito atteso
- il caso `9/10` viene risolto senza rigenerare `1-9`;
- calo del costo LLM;
- recovery operativa molto piu forte.

## Fase 4. Rendere il backend la vera regia del recupero
**Obiettivo:** spostare la logica di recupero dal comportamento implicito al controllo server-side.

### Interventi
- In `processCurrentChapter()` introdurre uno step esplicito:
  - verifica copertura attesa subito dopo ogni worker call;
  - se incompleta, classificazione `partial_generation`;
  - tentativo di recupero prima di arrivare a `finalizeChapterIfReady()`.
- Arricchire `book_generation_runs.metadata` con:
  - `expected_paragraph_numbers`
  - `written_paragraph_numbers`
  - `missing_paragraph_numbers`
  - `generation_attempt`
  - `request_signature`
- Distinguere errori:
  - `worker_contract_violation`
  - `partial_write_detected`
  - `chapter_validation_failed`

### Esito atteso
- run piu leggibili;
- migliore diagnosi in dashboard e DB;
- meno ambiguita tra problema LLM, problema workflow e problema server.

## Fase 5. Hardening pre-produzione
**Obiettivo:** validare il fix prima del rilascio.

### Test minimi obbligatori
- Caso felice: capitolo da 10 paragrafi, output completo, run `completed`.
- Caso parziale: il worker restituisce 4 paragrafi su 5, n8n deve fallire subito.
- Caso numerazione errata: ritorno `6,7,8,11,12`, n8n deve fallire subito.
- Caso duplicati: doppio `paragraph_number`, fallimento immediato.
- Caso retry mirato: dopo primo pass parziale, il backend rilancia solo i mancanti.
- Caso deduplica: due richieste parallele sullo stesso capitolo ma range diversi non devono collidere.

### Smoke test di integrazione
- libro completo da 5 capitoli;
- scenario resume dopo un run interrotto;
- scenario con ultimo capitolo incompleto e ripartenza da dati parziali.

### Query operative da usare
- elenco paragrafi mancanti per capitolo;
- elenco `ai_requests` per `chapterId + partNumber + paragraphRange`;
- elenco run fallite con `missing_paragraph_numbers`.

---

## Ordine Di Implementazione Consigliato

### Sprint tecnico breve, ordine ottimale
1. Correggere `Sanitize Chapter JSON` in n8n.
2. Rafforzare il prompt del writer con contract esplicito su numeri attesi e fuori range.
3. Aggiungere detection e retry mirato lato backend, con fallback su range minimo mancante.
4. Correggere la deduplica server delle `ai_requests`.
5. Aggiungere logging strutturato e `metadata` di run.
6. Eseguire smoke test su libro completo e caso parziale simulato.

Questo ordine riduce subito il rischio di produzione e consente di verificare il fix su basi diagnostiche molto piu solide.

---

## Decisioni Architetturali Consigliate

### Decisione 1. Mantenere split generation solo se diventa strettamente verificata
La split generation puo restare, ma solo se:
- ogni parte ha identity propria;
- ogni parte ha contract validation propria;
- il backend non accetta completamento parziale silenzioso.

Se il tempo e troppo stretto, la fallback piu sicura per il go-live e:
- disattivare temporaneamente il parallel split per `WRITE_CHAPTER_FROM_PLAN`;
- eseguire il capitolo in un'unica richiesta;
- reintrodurre il parallelismo dopo il fix dell'idempotenza.

### Decisione 2. Nessun `COMPLETED` implicito
Un worker non deve mai essere considerato riuscito solo perche ha risposto `200 OK`.
La definizione di successo deve essere:
- output strutturalmente valido;
- copertura completa dei paragrafi attesi;
- persistenza completa nel DB;
- validazione capitolo superata.

---

## Piano Di Rollout

### Step 1. Patch tecnica
- aggiornare workflow n8n;
- aggiornare `server/index.cjs`;
- aggiungere log e metadata.

### Step 2. Verifica in ambiente staging
- simulare risposta parziale del writer;
- verificare fallimento immediato del worker;
- verificare retry solo sui mancanti.

### Step 3. Soft launch controllato
- attivare su un set ristretto di libri;
- monitorare `book_generation_runs`, `ai_requests`, `debug_logs`.

### Step 4. Go-live
- promuovere il flusso solo dopo 0 casi di `partial write masked as completed` nei test finali.

---

## Definition of Done
- Nessuna request `WRITE_CHAPTER_FROM_PLAN` puo chiudersi `completed` con paragrafi mancanti.
- Due meta dello stesso capitolo sono distinguibili e idempotenti.
- Se manca 1 paragrafo su 10, il sistema tenta un recupero mirato senza rigenerare tutto.
- I log espongono chiaramente quali paragrafi erano attesi, scritti e mancanti.
- Il run fallisce solo con errore esplicito e operativamente utilizzabile.
- Il pulsante `Elabora Tutto` porta a completamento stabile del libro senza lasciare capitoli in stato ambiguo.

---

## Raccomandazione Finale
Per una messa in produzione a breve, la soluzione professionale non e aggiungere altri retry ciechi. La soluzione corretta e:

- bloccare subito i falsi positivi nel workflow;
- rendere univoche le due meta del capitolo;
- introdurre recovery mirato dei paragrafi mancanti;
- promuovere il backend a unica regia del controllo di completezza.

Questo approccio riduce il rischio operativo, limita il costo AI sprecato e rende il flusso finalmente affidabile per un prodotto a pagamento.
