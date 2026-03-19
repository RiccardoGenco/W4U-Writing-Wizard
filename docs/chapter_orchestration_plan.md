# Piano Implementazione: Generazione Capitoli da Blueprint + Traccia Sottocapitoli

## Obiettivo
Passare da generazione frammentata a una pipeline affidabile in cui ogni capitolo viene generato in modo completo usando:
- Intervista + configurazione progetto
- Blueprint (capitoli)
- Traccia sottocapitoli (outline del capitolo)
- Memoria dei contenuti già scritti

Risultato atteso:
- Nessun capitolo "parziale" senza segnalazione errore
- Stato async sempre coerente in `ai_requests`
- Qualità narrativa più alta e continuità tra capitoli

## Principi di Architettura
- Single owner async: solo un componente aggiorna lo stato finale di `ai_requests` per una specifica action.
- Idempotenza: stesso `bookId + chapterId + action` non deve creare doppie esecuzioni concorrenti.
- Serialità controllata: generazione capitoli uno per volta (o coda per libro) per evitare drift di contesto.
- Fail fast: se input incompleto, richiesta `failed` con errore esplicito.

## Nuovo Flusso (High-Level)
1. `BLUEPRINT` crea/aggiorna capitoli.
2. `SCAFFOLD_CHAPTER` crea la traccia dei sottocapitoli per ogni capitolo.
3. Verifica di completezza blueprint/scaffold.
4. `WRITE_CHAPTER_FROM_PLAN` genera un capitolo intero seguendo i sottocapitoli.
5. Salvataggio progressivo dei paragrafi e stato capitolo.
6. QA automatico finale per capitolo.

## Contratto Dati Minimo
Per ogni capitolo devono esistere:
- `chapters.id`, `chapter_number`, `title`, `summary`, `status`
- `paragraphs.chapter_id`, `paragraph_number`, `title`, `description`, `target_word_count`, `status`

Per ogni richiesta async:
- `ai_requests.status` in `pending -> processing -> completed|failed`
- `ai_requests.response_data` valorizzato solo in `completed`
- `ai_requests.error_message` valorizzato solo in `failed`

## Nuove Action / Routing
- Aggiungere action `WRITE_CHAPTER_FROM_PLAN`.
- `Action Switch` deve mandare `WRITE_CHAPTER_FROM_PLAN` a `Respond Started`, poi a `Async Action Router`.
- `Async Action Router` deve instradare `WRITE_CHAPTER_FROM_PLAN` a un ramo dedicato.

## Design Nodo n8n: WRITE_CHAPTER_FROM_PLAN
Ramo proposto:
1. `Get Book Context (Writer Chapter)`
2. `Get Chapter Plan` (capitolo + sottocapitoli ordinati)
3. `Get Previous Chapters Summary` (continuita narrativa)
4. `Build Chapter Writer Payload`
5. `Agent: Writer Chapter`
6. `Sanitize Chapter Output`
7. `Persist Paragraphs` (upsert per ogni sottocapitolo)
8. `Update Chapter Status`
9. `Update AI Request Status (Chapter Write)` su `ai_requests`

Regole:
- Se i sottocapitoli del capitolo sono meno del target atteso: `failed`.
- Se output LLM non parseabile: `failed`.
- Se parseabile ma incompleto: `failed` con messaggio strutturato.

## Prompting Strategy
Input LLM per capitolo:
- Intervista sintetizzata
- Configurazione tono/stile
- Blueprint globale
- Traccia sottocapitoli del capitolo corrente
- Riassunti capitoli precedenti (breve memoria)
- Vincoli formali (lunghezza target, struttura output JSON)

Output richiesto (strict JSON):
- `paragraphs: [{ paragraph_number, title, content, word_count_estimate }]`

## Backend/API
Endpoint attuale `/api/ai-agent` resta invariato.
Evoluzioni:
- Supportare nuova action `WRITE_CHAPTER_FROM_PLAN`.
- Idempotency guard: se esiste richiesta `processing` recente stesso `bookId/chapterId/action`, evitare duplicazione.
- Timeout guard server-side: richieste `processing` oltre soglia marcate `failed` da job di cleanup.

## Frontend UX
Nuovo comportamento in Production:
- Bottoni:
  - `Genera Capitolo` (singolo capitolo)
  - `Genera Tutti i Capitoli` (seriale)
- Stato visuale per capitolo:
  - `PLANNED`, `WRITING`, `REVIEW`, `COMPLETED`, `FAILED`
- Se capitolo `FAILED`: CTA `Rigenera Capitolo`.

## Migrazione Graduale
Fase 1:
- Attivare `WRITE_CHAPTER_FROM_PLAN` dietro feature flag.
- Mantenere `WRITE_PARAGRAPH` come fallback.

Fase 2:
- Nuovi libri usano solo il nuovo flusso.
- Libri esistenti: migrazione solo se scaffold completo.

Fase 3:
- Deprecare `WRITE_PARAGRAPH` per casi standard.

## Checklist Implementazione
1. Definire schema output JSON per writer chapter.
2. Implementare ramo n8n `WRITE_CHAPTER_FROM_PLAN`.
3. Aggiornare `Action Switch` e `Async Action Router`.
4. Aggiornare frontend Production con CTA e stato capitolo.
5. Aggiungere idempotency guard nel backend.
6. Aggiungere cleanup job per `ai_requests` zombie.
7. Abilitare metriche operative.

## QA Plan
Test funzionali:
1. Libro nuovo (50 pagine, 5 capitoli): generazione completa 5/5.
2. Capitolo con scaffold incompleto: richiesta `failed` esplicita.
3. Retry capitolo failed: nessun duplicato paragrafi.
4. Genera tutti capitoli: esecuzione seriale senza race.

Test robustezza:
1. Simulare timeout LLM: status finale `failed`.
2. Simulare output JSON invalido: status finale `failed`.
3. Simulare doppio click utente: una sola request attiva.

## KPI di Successo
- `ai_requests` stuck (`processing > 15m`) < 1%.
- Capitoli completati al primo tentativo > 90%.
- Nessun `completed` senza `response_data` valido.
- Deviazione parole/capitolo entro +/-15% target.

## Query Operative Utili
Richieste chapter write recenti:
```sql
select id, book_id, status, error_message, updated_at
from ai_requests
where action = 'WRITE_CHAPTER_FROM_PLAN'
order by updated_at desc
limit 50;
```

Verifica completezza capitolo:
```sql
select c.id, c.chapter_number, c.title,
       count(p.id) as paragraphs_count,
       sum(case when p.status = 'COMPLETED' then 1 else 0 end) as completed_paragraphs
from chapters c
left join paragraphs p on p.chapter_id = c.id
where c.book_id = :book_id
group by c.id, c.chapter_number, c.title
order by c.chapter_number;
```

Cleanup richieste zombie:
```sql
update ai_requests
set status = 'failed',
    error_message = coalesce(error_message, 'Timeout/abandoned async execution'),
    updated_at = now()
where status = 'processing'
  and updated_at < now() - interval '15 minutes';
```

## Rischi e Mitigazioni
- Rischio: regressione su flussi legacy.
  - Mitigazione: feature flag + rollout progressivo.
- Rischio: output LLM non aderente schema.
  - Mitigazione: JSON strict + validator + fail fast.
- Rischio: costo API più alto.
  - Mitigazione: caching contesto, chunk mirato, temperature conservative.
