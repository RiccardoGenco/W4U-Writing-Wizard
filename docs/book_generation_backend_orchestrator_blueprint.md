# Blueprint Tecnico: Orchestratore Backend per Generazione Libro

## Obiettivo
Costruire un flusso affidabile e sicuro per un servizio a pagamento che:
- genera prima `capitoli` e `tracce sottocapitoli`
- poi genera ogni capitolo in ordine, uno per volta
- rispetta il `target_pages` a livello libro con tolleranza `+-10%`
- privilegia coerenza e qualita del testo rispetto alla velocita

## Decisione Architetturale
Orchestrazione principale nel backend.

Distribuzione responsabilita:
- Frontend: avvia il job, mostra stato, consente retry/manual actions
- Backend: orchestration, idempotenza, sicurezza, gating, serialita
- n8n: worker AI stateless per task singoli
- Database: single source of truth per stato e output

## Motivazione
Questa soluzione e la piu solida perche:
- evita loop distribuiti fra frontend e n8n
- centralizza sicurezza e controllo costi lato server
- riduce race conditions e richieste zombie
- rende debuggabile l'intero ciclo libro

## Fasi del Processo
1. `INTERVIEW`
2. `OUTLINE`
3. `SCAFFOLD_ALL_CHAPTERS`
4. `WRITE_BOOK`
5. `REVIEW`
6. `COMPLETE`

Il backend governa la transizione di fase.

## Regole Hard
- Un solo job attivo per libro.
- Un solo capitolo in scrittura per libro.
- Nessun capitolo `completed` se:
  - mancano sottocapitoli previsti
  - il testo totale capitolo e sotto il minimo previsto
  - il parsing output e incompleto
- Nessun libro `completed` se il totale parole e fuori tolleranza `+-10%`.
- In fase di test: su errore il job si ferma in `failed`, senza retry automatici.

## Schema Dati Minimo
### Nuova tabella `book_generation_runs`
Campi consigliati:
- `id uuid primary key`
- `book_id uuid not null`
- `status text not null`
- `phase text not null`
- `current_chapter_id uuid null`
- `current_chapter_number integer null`
- `target_total_words integer not null`
- `actual_total_words integer null`
- `expected_chapters integer null`
- `completed_chapters integer null`
- `last_error text null`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status consigliati:
- `pending`
- `planning`
- `writing`
- `review`
- `completed`
- `failed`

Phase consigliate:
- `outline`
- `scaffold`
- `write_chapter`
- `final_review`

### Tabelle esistenti riutilizzate
- `books`
- `chapters`
- `paragraphs`
- `ai_requests`

### Cambi minimi consigliati su tabelle esistenti
Su `chapters`:
- mantenere `status`
- opzionale aggiunta `target_word_count integer`
- opzionale aggiunta `actual_word_count integer`

Su `paragraphs`:
- gia presenti o da confermare:
  - `target_word_count`
  - `actual_word_count`
  - `status`

## Endpoint Backend Nuovi
### `POST /api/book-generation/start`
Scopo:
- creare un `book_generation_run`
- validare prerequisiti
- avviare processo asincrono server-side

Payload minimo:
```json
{
  "bookId": "uuid"
}
```

Risposta:
```json
{
  "status": "started",
  "runId": "uuid"
}
```

### `GET /api/book-generation/status/:runId`
Scopo:
- ritorna stato run, capitolo corrente, avanzamento, ultimo errore

### `POST /api/book-generation/retry-chapter`
Scopo:
- riavvia un capitolo fallito specifico

## Idempotenza e Sicurezza
### Regole
- Se esiste un run `pending|planning|writing|review` per lo stesso `book_id`, nuova start request viene rifiutata.
- Verifica ownership libro su ogni endpoint tramite utente autenticato.
- Rate limiting sugli endpoint di generazione.
- Nessuna chiave AI o DB esposta al frontend.
- Tutte le decisioni di orchestrazione solo server-side.

### Controlli consigliati
- lock logico via query `select for update` o update condizionale
- deduplica su `book_id + status attivo`
- audit log server-side degli step principali

## Ruolo di n8n
n8n deve smettere di orchestrare il libro intero.

Deve esporre solo worker task:
- `OUTLINE`
- `SCAFFOLD_CHAPTER`
- `WRITE_CHAPTER_FROM_PLAN`

Ogni task deve:
- ricevere input completo dal backend
- restituire output deterministico
- non decidere la fase successiva
- non fare loop globali libro

## Worker: OUTLINE
Input:
- intervista consolidata
- `target_pages`
- `target_chapters`
- configurazione editoriale

Output:
- lista capitoli ordinati
- ogni capitolo con `title`, `summary`

Gate:
- numero capitoli uguale all'atteso
- nessun capitolo vuoto

## Worker: SCAFFOLD_CHAPTER
Input:
- capitolo corrente
- blueprint globale
- target sottocapitoli del capitolo

Output:
- `paragraphs[]` con:
  - `paragraph_number`
  - `title`
  - `description`
  - `target_word_count`

Gate:
- numero sottocapitoli uguale all'atteso
- nessun `description` vuoto

## Worker: WRITE_CHAPTER_FROM_PLAN
Input:
- intervista sintetizzata
- blueprint globale
- capitolo corrente
- traccia sottocapitoli del capitolo
- riassunti capitoli precedenti
- target parole capitolo

Output richiesto:
```json
{
  "paragraphs": [
    {
      "paragraph_number": 1,
      "title": "string",
      "content": "string",
      "word_count_estimate": 250
    }
  ]
}
```

Gate:
- copertura completa di tutti i sottocapitoli previsti
- nessun `content` vuoto
- target parole capitolo sopra soglia minima

## Orchestrazione Backend
Pseudo-flow:
1. Carica libro e crea run.
2. Verifica `target_pages`, `target_chapters`, intervista.
3. Se manca outline, esegui worker `OUTLINE`.
4. Per ogni capitolo, se manca scaffold completo, esegui `SCAFFOLD_CHAPTER`.
5. Quando tutti i capitoli hanno scaffold valido, entra in `writing`.
6. Per ogni capitolo in ordine:
   - calcola target parole capitolo
   - chiama `WRITE_CHAPTER_FROM_PLAN`
   - valida output
   - salva paragraphs
   - aggiorna `chapters.actual_word_count`
   - aggiorna run
7. A fine libro verifica target totale.
8. Se dentro tolleranza, marca `completed`; altrimenti `failed`.

## Calcolo Target Parole
Base:
- `target_total_words = target_pages * words_per_page`
- default `words_per_page = 250`

Distribuzione:
- inizialmente uniforme per capitolo
- opzionale fase 2: pesi diversi per capitoli introduttivi/finali

Tolleranze:
- libro: `+-10%`
- capitolo: minimo `85%` del target capitolo

## Quality Gates
### Livello sottocapitolo
- titolo presente
- description presente

### Livello capitolo
- tutti i sottocapitoli coperti
- lunghezza minima raggiunta
- nessun output strutturalmente invalido

### Livello libro
- capitoli completati = capitoli previsti
- parole totali entro tolleranza
- nessun capitolo `failed`

## Frontend Target
`ProductionPage` deve diventare un monitor.

Responsabilita frontend:
- mostrare stato run
- mostrare capitolo corrente
- mostrare avanzamento
- consentire retry manuale

Non deve:
- orchestrare loop capitoli
- decidere quando passare al capitolo successivo
- inferire stato da poll sparsi sui paragrafi

## Logging e Observability
### Da salvare
- eventi run principali
- capitolo corrente
- durata task
- errori worker
- mismatch target parole

### Query di controllo
Run attive:
```sql
select id, book_id, status, phase, current_chapter_number, last_error, updated_at
from book_generation_runs
order by updated_at desc;
```

Capitoli incompleti:
```sql
select c.id, c.book_id, c.chapter_number, c.title, c.status,
       count(p.id) as paragraphs_count,
       sum(case when p.content is not null and length(p.content) > 0 then 1 else 0 end) as written_paragraphs
from chapters c
left join paragraphs p on p.chapter_id = c.id
group by c.id, c.book_id, c.chapter_number, c.title, c.status
order by c.book_id, c.chapter_number;
```

## Rollout a Rischio Basso
### Fase 1
- creare tabella `book_generation_runs`
- introdurre endpoint backend nuovi
- non toccare ancora il flusso legacy

### Fase 2
- implementare worker `WRITE_CHAPTER_FROM_PLAN`
- backend usa nuovo orchestration solo dietro flag

### Fase 3
- frontend Production usa nuovo endpoint `start`
- vecchio flusso resta fallback manuale

### Fase 4
- dismettere loop frontend/n8n legacy

## Rischi Principali
- duplicazione job attivi
- drift tra stato DB e stato run
- output AI incompleto ma parseabile
- backlog di richieste zombie

## Mitigazioni
- lock/idempotenza forte
- quality gates espliciti
- cleanup automatico job vecchi
- backend come unica regia

## File Principali da Toccare
- `server/index.cjs`
- `src/pages/wizard/ProductionPage.tsx`
- `src/lib/api.ts`
- `n8n/workflows/w4u_workflow.json`
- eventuale migration SQL nuova per `book_generation_runs`

## Definition of Done
- un libro puo essere avviato con una sola action di start
- il backend genera tutti i capitoli in ordine senza intervento frontend
- nessun capitolo resta sospeso in stato ambiguo
- nessun libro `completed` fuori tolleranza oltre `+-10%`
- errori sempre espliciti e recuperabili
