# n8n Workflow Patch Checklist (Node-by-Node)

## Goal
Rendere il workflow coerente con il proxy async (`/api/ai-agent`) eliminando race condition, fallback silenziosi a `100`, doppie response webhook e parsing fragile.

## Pre-deploy safety
1. Esporta workflow corrente da n8n (`w4u_workflow.json`) con version tag.
2. Duplica il workflow in staging.
3. Esegui le patch sotto in staging, poi test end-to-end.

## Patch 1 - Single owner su `ai_requests` (OUTLINE, WRITE)
`Problem`: doppio update concorrente su `response_data`.

1. Node `Update AI Request Status (Outline)`:
- Opzione A (raccomandata): scollega/disable il node.
- Opzione B: mantieni solo update di metadati non sovrascrivendo `response_data`.

2. Node `Update Request Status (Writer)`:
- Opzione A (raccomandata): scollega/disable il node.
- Opzione B: aggiorna solo `updated_at`/telemetria.

3. Mantieni come owner finale il proxy backend (`forwardToN8n`) per i rami sync.

## Patch 2 - Rimuovere doppia response nel ramo async WRITE
`Problem`: `Respond Started` + `Response Write` nella stessa execution.

1. In `Action Switch`, per `WRITE` e `WRITE_PARAGRAPH`, mantieni route verso `Respond Started`.
2. Rimuovi collegamento `Update Paragraph -> Response Write`.
3. Mantieni (se serve) solo `Update Paragraph -> ...` senza `respondToWebhook` finale.

## Patch 3 - Eliminare fallback silenzioso a `100`
`Problem`: target pages può tornare 100 in condizioni parziali.

1. Node `Calculator` (`Code`):
- Sostituisci:
`const targetPages = parseInt(targetPagesRaw) || 100;`
- Con validazione hard:
`const parsed = Number(targetPagesRaw); if (!Number.isFinite(parsed) || parsed <= 0) { throw new Error("targetPages missing/invalid"); } const targetPages = Math.round(parsed);`

2. Node `Init Book (Optional)` (`Postgres` query):
- Rimuovi `COALESCE(..., 100)` in insert/update.
- Se `$6` assente: usa `books.target_pages` esistente o interrompi con errore.
- Non forzare `'100'::jsonb` in `context_data.target_pages`.

## Patch 4 - Hardening parsing JSON modello
`Problem`: `JSON.parse(...)` inline nei `responseBody`.

1. `Response Interview`:
- Sposta parsing in un node `Code` prima della response (try/catch + fallback controllato).
- `Response Interview` deve rispondere con valori già validati.

2. `Response Scaffold`:
- Stesso pattern: parsing in `Code`, risposta solo con `data.chapters` validato.

3. `Sanitize Chapters` e `Sanitize Concepts`:
- Sostituisci regex greedy `/\{[\s\S]*\}/` con parser robusto:
  - preferisci `response_format: json_object` a monte
  - fallback: estrazione fenced JSON + parse con error handling esplicito.

## Patch 5 - Correzione `Upload to Supabase Storage`
`Problem`: parametri malformati (`bookId `, `=={{ ... }}`).

1. Node `Upload to Supabase Storage`:
- key `bookId ` -> `bookId`
- `=={{ ... }}` -> `={{ ... }}`

2. Dopo patch, puoi rimuovere workaround backend su `bookId ` e `replace(/^=/...)`.

## Patch 6 - Coerenza telemetria costi
`Problem`: `Log AI Usage: Refine Prompt with LLM` prende modello dal context sbagliato.

1. Nel query template del node:
- sostituisci riferimenti `Get Book Context1` con `Get Book Context Cover`.

## Smoke test matrix (obbligatorio)
1. `INTERVIEW` -> deve rispondere 200 con payload valido.
2. `GENERATE_CONCEPTS` con progetto 50 pagine -> verifica che `target_pages` resti 50.
3. `OUTLINE` async -> `ai_requests.status` deve passare `pending -> processing -> completed`, con `response_data` shape stabile.
4. `WRITE_PARAGRAPH` async -> nessun errore "response already sent", polling frontend completato.
5. `SCAFFOLD_CHAPTER` con feedback -> risposta valida anche con output modello non perfetto.
6. `GENERATE_COVER` -> upload cover OK senza chiavi malformate.
7. `INDEX_DRAFT` su testo grande -> chunking e upsert senza errori.

## Query di verifica rapida
1. Verifica request in errore:
`select id, action, status, error_message, updated_at from ai_requests order by updated_at desc limit 50;`
2. Verifica drift target pages:
`select id, target_pages, context_data->>'target_pages' as ctx_target from books order by updated_at desc limit 50;`
3. Verifica doppio writer completion:
`select id, action, status, response_data from ai_requests where action in ('WRITE','WRITE_PARAGRAPH') order by updated_at desc limit 20;`

## Rollout consigliato
1. Patch 2 + Patch 1 (stabilità polling/response).
2. Patch 3 (coerenza business target pages).
3. Patch 4 (robustezza parsing AI).
4. Patch 5 + Patch 6 (igiene integrazione e telemetria).

