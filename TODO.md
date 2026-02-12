# W4U — Piano di Implementazione

## Sicurezza e Infrastruttura

### 1. Webhook protetti e non parlanti

**Stato attuale:** I webhook n8n (`/webhook/book-agent-v2`) sono esposti senza autenticazione. In caso di errore restituiscono messaggi dettagliati con hint interni (es. "Click the Execute workflow button...").

**Soluzione:**
- Generare un token segreto (UUID v4) e salvarlo come variabile d'ambiente sia nel frontend (`VITE_WEBHOOK_SECRET`) che in n8n (come credential)
- Aggiungere un nodo `IF` subito dopo il `Webhook Router` che verifica l'header `X-Webhook-Secret` e rifiuta le richieste non autenticate
- Nel nodo di risposta errore, restituire solo `{ "success": false, "error": "Request failed" }` senza messaggi verbosi
- Lato frontend in `api.ts`, aggiungere l'header `X-Webhook-Secret` a tutte le chiamate `fetch` in `callBookAgent()`

tema chiaro/tema scuro in alto a dx


**File coinvolti:**
- `src/lib/api.ts` → aggiungere header di autenticazione
- `.env` / `.env.example` → aggiungere `VITE_WEBHOOK_SECRET`
- `n8n/workflows/W4U_Generate_Cover_DALLE3.json` → aggiungere nodo di validazione e sanitizzare tutti i messaggi di errore

---

### 2. Dashboard login e autenticazione

**Stato attuale:** Nessun sistema di autenticazione. Chiunque abbia l'URL può accedere a tutte le funzionalità.

**Soluzione:**
- Utilizzare **Supabase Auth** (già integrato via `@supabase/supabase-js`) con provider email/password
- Creare le pagine `LoginPage.tsx` e `RegisterPage.tsx` in `src/pages/auth/`
- Creare un componente `AuthGuard.tsx` in `src/components/` che wrappa le route protette e redirige a `/login` se non autenticato
- Modificare `App.tsx` per wrappare le route del wizard e della dashboard con `AuthGuard`
- Aggiungere una colonna `user_id` alla tabella `books` per associare i libri all'utente autenticato
- Aggiungere RLS (Row Level Security) alle tabelle `books`, `chapters`, `ai_usage_logs` per isolare i dati per utente
- Salvare il `user_id` nel body delle richieste al webhook n8n

**File coinvolti:**
- `src/pages/auth/LoginPage.tsx` [NEW]
- `src/pages/auth/RegisterPage.tsx` [NEW]
- `src/components/AuthGuard.tsx` [NEW]
- `src/App.tsx` → wrapping route
- `src/lib/api.ts` → passare token JWT nelle chiamate
- Supabase: migrazione SQL per RLS e colonna `user_id`

---

## Deploy e Hosting

### 3. Vercel staging

**Stato attuale:** L'app gira solo in sviluppo locale con `vite dev` e proxy verso `auto.mamadev.org`.

**Soluzione:**
- Creare un progetto Vercel collegato al repository GitHub
- Configurare due ambienti: **Preview** (staging, deploy automatico da branch `develop`) e **Production** (deploy da branch `main`)
- Creare `vercel.json` nella root per configurare le rewrites del proxy verso n8n (sostituisce il proxy Vite che funziona solo in dev)
- Configurare le variabili d'ambiente su Vercel Dashboard: `VITE_N8N_WEBHOOK_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Per il server Express (`server/index.js`), valutare il deploy come Vercel Serverless Function oppure su un servizio separato (Railway, Render)

**File coinvolti:**
- `vercel.json` [NEW] → rewrites e configurazione build
- `vite.config.ts` → rimuovere proxy hardcoded (verrà gestito da Vercel rewrites)
- `.env.example` → documentare variabili per staging vs production

---

## Business

### 4. Pricing model

**Stato attuale:** Nessun sistema di pricing o limiti di utilizzo.

**Soluzione:**
- Definire i piani (es. Free: 1 libro/mese, Pro: 10 libri/mese, Enterprise: illimitato)
- Creare una tabella `subscriptions` in Supabase con campi `user_id`, `plan`, `books_limit`, `starts_at`, `expires_at`
- Creare una tabella `usage_counters` per tracciare l'utilizzo mensile per utente
- Integrare **Stripe** per i pagamenti: creare un endpoint nel server Express per gestire i webhook Stripe (checkout session completed, subscription updated, ecc.)
- Aggiungere una pagina `PricingPage.tsx` con le card dei piani e i pulsanti di checkout
- Aggiungere un check nel frontend (prima di ogni generazione AI) e nel webhook n8n (come guardia) per verificare che l'utente non abbia superato i limiti del piano
- Utilizzare la tabella `ai_usage_logs` già esistente per calcolare i costi effettivi per utente

**File coinvolti:**
- `src/pages/PricingPage.tsx` [NEW]
- `src/components/UsageBanner.tsx` [NEW] → badge con utilizzo rimanente
- `server/index.js` → endpoint webhook Stripe
- Supabase: migrazione per tabelle `subscriptions` e `usage_counters`
- `n8n/workflows/` → nodo di verifica quota prima di ogni agente AI

---

## UI/UX

### 5. Tema chiaro

**Stato attuale:** Solo tema scuro, definito con CSS custom properties in `index.css`.

**Soluzione:**
- Il sistema è già predisposto grazie alle CSS custom properties (`--bg-primary`, `--text-primary`, ecc.)
- Creare un set di variabili `[data-theme="light"]` in `index.css` con i valori chiari corrispondenti
- Creare un componente `ThemeToggle.tsx` (switch sole/luna) da inserire nel layout principale
- Salvare la preferenza nel `localStorage` e rispettare `prefers-color-scheme` del sistema operativo come default
- Applicare `data-theme` all'elemento `<html>` tramite un hook `useTheme()`

**File coinvolti:**
- `src/index.css` → variabili light theme
- `src/components/ThemeToggle.tsx` [NEW]
- `src/lib/useTheme.ts` [NEW] → hook per gestione tema
- `src/layouts/` → inserire ThemeToggle nel layout

---

### 6. Grafica generazione e streaming risposta

**Stato attuale:** Durante la generazione AI, viene mostrato solo un semplice spinner con testo statico che cambia a step (`setProgressStage`). Non c'è streaming delle risposte.

**Soluzione:**
- **Progress bar animata**: Sostituire il testo statico con una barra di progresso a step con animazione fluida (CSS transitions). Ogni step ha un peso percentuale (es. Preparazione 10%, Generazione 60%, Salvataggio 30%)
- **Skeleton loading**: Mostrare placeholder animati (skeleton) nella zona dove apparirà il contenuto generato
- **Streaming risposte**: Per le risposte testuali (intervista, capitoli), implementare Server-Sent Events (SSE) nel webhook n8n oppure utilizzare Supabase Realtime. Il testo apparirebbe progressivamente con effetto typewriter
- **Animazioni di transizione**: Aggiungere Framer Motion `AnimatePresence` tra gli stati di caricamento e risultato

**File coinvolti:**
- `src/components/GenerationProgress.tsx` [NEW] → componente progress bar riutilizzabile
- `src/components/StreamingText.tsx` [NEW] → componente typewriter per risposte
- Pagine wizard (`ConceptPage.tsx`, `BlueprintPage.tsx`, `ProductionPage.tsx`, `CoverPage.tsx`) → integrare i nuovi componenti

---

## Robustezza

### 7. Gestione errori granulare

**Stato attuale:** Gli errori vengono catturati genericamente con `try/catch` e mostrati con `alert()`. Il retry è automatico (3 tentativi) ma senza differenziazione del tipo di errore.

**Soluzione:**
- Creare un sistema di classificazione errori in `src/lib/errors.ts`:
  - `NetworkError` → mostrare "Connessione persa, riprova" con retry automatico
  - `TimeoutError` → mostrare "La generazione sta impiegando più del previsto" con opzione di attendere
  - `QuotaError` → mostrare "Hai raggiunto il limite del piano" con link al pricing
  - `WorkflowError` → mostrare "Errore temporaneo, riprova tra qualche secondo"
  - `ValidationError` → mostrare il problema specifico (es. "Il titolo è troppo lungo")
- Creare un componente `ErrorBanner.tsx` che sostituisce gli `alert()` con notifiche in-page non bloccanti (toast)
- Nel backend n8n, aggiungere nodi `Error Trigger` alla fine di ogni percorso con codici errore strutturati (es. `{ "error_code": "GENERATION_TIMEOUT", "message": "..." }`)
- Aggiungere un sistema di fallback: se un agente AI fallisce, tentare con un modello alternativo prima di restituire errore

**File coinvolti:**
- `src/lib/errors.ts` [NEW] → classificazione errori
- `src/components/ErrorBanner.tsx` [NEW] → toast/notifiche
- `src/lib/api.ts` → parsing errori strutturati
- `n8n/workflows/` → nodi Error Trigger su ogni percorso

---

### 8. Limite caratteri in generazione

**Stato attuale:** Nessun limite sulla lunghezza dei prompt o dei contenuti generati. Il parametro `max_tokens` non è esplicitamente controllato.

**Soluzione:**
- Definire limiti per ogni tipo di generazione:
  - Intervista AI: max 2000 token per risposta
  - Concept/Blueprint: max 4000 token
  - Capitoli: max 6000 token per capitolo
  - Prompt copertina: max 1000 caratteri (limite DALL-E 3)
- Implementare i limiti nei system prompt degli agenti n8n (istruzione esplicita "La tua risposta non deve superare X parole")
- Aggiungere validazione frontend sui campi di input utente (titolo max 100 caratteri, note max 500 caratteri)
- Creare un contatore di caratteri rimanenti visibile nei campi di input
- Nel nodo `Extract & Sanitize Prompt`, troncare il prompt se supera 1000 caratteri prima di inviarlo a DALL-E 3

**File coinvolti:**
- `src/components/CharCounter.tsx` [NEW] → contatore caratteri per input
- `n8n/workflows/W4U_Generate_Cover_DALLE3.json` → parametri `max_tokens` e troncamento prompt
- Pagine wizard → aggiungere validazione input

---

## Testing e Contenuti

### 9. Generazione libri tecnici e domande adatte

**Stato attuale:** Le domande dell'intervista AI sono pensate per narrativa (fiction). I prompt degli agenti presuppongono trama, personaggi, ambientazione.

**Soluzione:**
- Aggiungere un selettore "Tipo di libro" nella `ConfigurationPage.tsx` con opzioni: Narrativa, Saggistica, Manuale Tecnico, Guida Pratica, Autobiografia
- Creare template di domande diversificati per ogni tipo. Per i libri tecnici:
  - "Qual è l'argomento principale e il livello del lettore target?"
  - "Quali problemi concreti risolverà questo libro?"
  - "Che struttura preferisci? (Tutorial step-by-step, Riferimento, Case study)"
- Salvare il tipo di libro nella tabella `books` (nuova colonna `book_type`)
- Modificare il system prompt dell'`Agent: Interviewer` in n8n per adattare le domande al tipo selezionato
- Modificare i prompt di Plotter, Architect e Writer per generare contenuto non-fiction quando appropriato (es. elenchi puntati, esempi di codice, tabelle)
- Testare con 2-3 libri di prova per ogni categoria per validare la qualità

**File coinvolti:**
- `src/pages/wizard/ConfigurationPage.tsx` → selettore tipo libro
- `n8n/workflows/W4U_Generate_Cover_DALLE3.json` → system prompt condizionali per ogni agente
- Supabase: migrazione per colonna `book_type` nella tabella `books`
