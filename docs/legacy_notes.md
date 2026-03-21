# Note Storiche e Tecniche di Sviluppo (Sintesi Legacy)

Questo documento raccoglie le informazioni salienti rimosse dai file temporanei e report di debug per mantenere pulita la codebase.

## 1. Bug Fix Critici (Marzo 2026)

### Conteggio Parole (Comma Shifting)
- **Problema**: n8n troncava il testo dei paragrafi alla prima virgola perché i parametri SQL erano passati come stringa semplice.
- **Soluzione**: Passaggio dei parametri come **Array** nel nodo `Update Paragraph` di n8n.
- **Ripristino**: Eseguito ricalcolo massivo di `actual_word_count` basato sul testo reale salvato.

### UI Hanging & System Reset
- **Problema**: Record rimasti in stato `pending` o `started` bloccavano l'orchestratore.
- **Soluzione**: Reset forzato a `failed` (`System Reset`) per tutti i run rimasti appesi in stati non finali.

### Permessi (403 Forbidden - chapters)
- **Problema**: Gli admin non potevano modificare capitoli di altri utenti.
- **Soluzione**: Aggiunta policy RLS per permettere `ALL` su `chapters` se `is_admin = true` nel profilo.

## 2. Architettura n8n (Patch Workflow)

### Proxy Async e Webhook
- Migrazione verso `/api/ai-agent` per gestire le chiamate in modo asincrono.
- Eliminazione delle doppie risposte webhook nel ramo `WRITE_PARAGRAPH`.
- Hardening del parsing JSON per evitare fallback a valori predefiniti (es. 100 pagine) quando l'AI risponde in formati non standard.

### Integrazione Storage
- Correzione nomi parametri per l'upload su Supabase Storage (`bookId` vs `bookId `).

## 3. Database Schema Health
- Introduzione della tabella `book_generation_runs` per tracciare lo stato avanzamento.
- Aggiunta di `actual_word_count` alla tabella `chapters` per monitoraggio lunghezza.
- Tabelle core verificate: `books`, `chapters`, `paragraphs`, `ai_requests`, `debug_logs`.

## 4. Test e Utility (Legacy)
- Utilizzati script `test_wordcount_v2.js` per validare la logica di conteggio parole lato n8n e server.
- Script `patch_w4u.mjs` utilizzato per il ricollegamento automatico dei nodi n8n disconnessi.
