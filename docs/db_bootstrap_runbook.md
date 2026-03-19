# Runbook: Bootstrap Database Schema

## Stato attuale
Il progetto locale contiene migration Supabase, ma il database remoto puo non averle ricevute.

Il sintomo tipico e:
- `404` su `rest/v1/book_generation_runs`
- `Failed to check active run`

## File da applicare
- [20260319000002_create_book_generation_runs.sql](/C:/Users/genco/Desktop/lavoro/w4uN8N/supabase/migrations/20260319000002_create_book_generation_runs.sql)
- [bootstrap_book_generation_runs.sql](/C:/Users/genco/Desktop/lavoro/w4uN8N/supabase/sql/bootstrap_book_generation_runs.sql)

Il secondo file e idempotente ed e pensato come fallback rapido.

## Verifica schema
Endpoint backend:
- `GET /api/db/schema-health`

Tabelle controllate:
- `books`
- `chapters`
- `paragraphs`
- `ai_requests`
- `debug_logs`
- `book_generation_runs`

## Procedura consigliata
1. Applicare le migration Supabase del repo sul database remoto.
2. Se serve un fix rapido, eseguire il contenuto di `supabase/sql/bootstrap_book_generation_runs.sql` nello SQL editor Supabase.
3. Attendere refresh della schema cache di Supabase/PostgREST.
4. Verificare `GET /api/db/schema-health`.
5. Rilanciare `Genera Tutto`.

## Nota importante

Le patch applicate qui servono a:
- preparare lo schema nel repo
- diagnosticare in modo chiaro le tabelle mancanti
- evitare errori opachi lato frontend/backend
