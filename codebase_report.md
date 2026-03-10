# Report Stato Codebase: W4U - Writing Wizard

## 📌 Panoramica Energetica
Il progetto è un'applicazione web avanzata per la generazione assistita di libri tramite IA. L'architettura è composta da:
- **Frontend**: React + Vite + TypeScript (Moderno, performante).
- **Backend Proxy**: Express (Node.cjs) agisce da ponte verso n8n e gestisce logicamente pesanti (Export PDF/EPUB/DOCX).
- **Database**: Supabase (PostgreSQL) con logica RLS e trigger di sicurezza.
- **Automazione**: n8n gestisce la pipeline multi-agente (Architect, Writer, Scaffolder).

---

## ⚠️ Criticità Rilevate

### 1. Monolito Backend ([server/index.cjs](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/server/index.cjs))
Il file [server/index.cjs](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/server/index.cjs) ha superato le 1200 linee. Contiene logiche mischiate di:
- Gestione Export (PDF, DOCX, EPUB).
- Proxy verso n8n.
- Utility di sanificazione testo.
- Gestione pagamenti (accenni a Stripe).
- Auth helpers.
> [!WARNING]
> La manutenibilità calerà drasticamente. È necessaria una modularizzazione (es. `/routes`, `/services`, `/utils`).

### 2. Rischio Timeout su Vercel (Export)
L'endpoint `/export/pdf` utilizza **Puppeteer** per generare PDF in A4. 
- **Problema**: Vercel Hobby ha un limite di 10s per le Serverless Functions. Generare un libro di 100+ pagine supererà quasi certamente questo limite, causando errori 504.
- **Stato attuale**: È presente una logica di "lazy loading" per Puppeteer, ma non risolve il timeout intrinseco della computazione lunga.

### 3. Assenza di Automated Tests
Non sono stati rintracciati test unitari o di integrazione (`vitest`, `jest`, `cypress`). 
- **Rischio**: Ogni modifica alla logica di sanificazione o alla pipeline di export potrebbe introdurre regressioni silenziose nei documenti finali.

---

## 🔒 Problemi di Sicurezza

### 1. RLS Disabilitato su `draft_chunks`
Dall'analisi del database, la tabella `public.draft_chunks` risulta con `rls_enabled: false`.
- **Rischio**: Se questa tabella memorizza bozze di testo degli utenti, un utente malevolo potrebbe potenzialmente leggere i contenuti di altri utenti tramite chiamate dirette all'API Supabase.

### 2. Meccanismo Invite Code "Soft"
La verifica del codice invito avviene tramite un confronto stringa nel backend (`/api/auth/verify-invite`).
- **Nota**: È funzionale per una beta chiusa, ma non scala; non c'è traccia di codici monouso o legati all'email, facilitando il "leak" del codice unico.

### 3. CORS Open
In assenza di `VITE_APP_URL` configurato, il server risponde con `Access-Control-Allow-Origin: *`.
- **Raccomandazione**: Stringere i parametri CORS in produzione per accettare solo il dominio del frontend.

---

## 🚀 Verso la Produzione: Cosa manca?

### 1. Testing Reale vs Mock
- È presente un file [MockBookPage.tsx](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/src/pages/wizard/MockBookPage.tsx), indicando che parti della UI sono state testate con dati statici.
- La logica di **Stripe** sembra in fase embrionale ([Pricing.tsx](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/src/pages/Pricing.tsx), `transactions_log`). Il flusso di checkout completo deve essere validato end-to-end con i webhook di Stripe.

### 2. Gestione Code (Async Jobs)
Attualmente il backend invia a n8n e attende la risposta (anche se il frontend fa polling). 
- **Ottimizzazione**: Per export molto lunghi, il server dovrebbe salvare il file in uno storage (Supabase Bucket) e notificare l'utente via Realtime/Email, invece di forzare un download diretto via HTTP che rischia il timeout.

### 3. Duplicati e Pulizia
- **Duplicati**: Le funzioni di [editorialCasing](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/server/index.cjs#74-95) e [removeEmojis](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/server/index.cjs#59-63) sono definite inline nel server e probabilmente duplicate o necessarie anche nel frontend per anteprime accurate.
- **File Inutili**: Alcuni commenti nel server (`// const Epub = require("epub-gen");`) e file di log debug molto pesanti (7000+ righe) indicano la necessità di una policy di rotazione log.

---

## 💡 Ottimizzazioni Possibili

- **Shared Lib**: Creare una cartella `shared` o un pacchetto locale per le utility di sanificazione (utilizzate sia da Proxy che da n8n/Frontend).
- **Edge Functions**: Spostare la logica di `toggle-admin` (già presente in Supabase Functions) e altre piccole API direttamente su Supabase Edge Functions per ridurre la dipendenza dal server Express.
- **Caching n8n**: Implementare un sistema di cache per i prompt pesanti (Concept Generation) per evitare di invocare inutilmente i modelli se l'utente richiede la stessa azione più volte senza modifiche al blueprint.

---

## 🔗 Contesto n8n & Supabase
Il workflow n8n ([w4u_workflow.json](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/n8n/workflows/w4u_workflow.json)) è il cuore pulsante. Il pattern **Proxy + Polling** implementato è corretto per gestire l'asincronia dell'IA, ma la stabilità dipende totalmente dalla tabella `ai_requests`. 
**Suggerimento**: Aggiungere un trigger su Supabase che pulisca le richieste `failed` obsolete per mantenere la tabella snella.
