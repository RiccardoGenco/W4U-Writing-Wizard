# W4U Writing Wizard

W4U Writing Wizard è un assistente alla scrittura AI-powered che guida l'autore dalla fase di ideazione fino alla produzione del manoscritto completo, inclusa la generazione della copertina.

## ✨ Funzionalità

- **Wizard Flow**: Percorso guidato in 6 step — Configurazione → Concept → Blueprint → Produzione → Cover → Export
- **Intervista AI**: Agente intelligente con domande personalizzate per genere
- **Multi-agente**: 8 agenti AI specializzati (Concept Gen, Interviewer, Architect, Plotter, Writer, Editor, Cover Prompt, DALL-E 3)
- **Autenticazione**: Login/Registrazione con Supabase Auth + RLS per isolamento dati utente
- **Export Multi-formato**: EPUB, PDF, anteprima PNG
- **Token Monitoring**: Tracciamento automatico dei token consumati con stima costi in EUR
- **Loading avanzato**: Overlay full-page con messaggi rotanti durante la generazione

## 🛠️ Tech Stack

| Layer | Tecnologia |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Framer Motion, Lucide React |
| **Backend API** | Express.js (export EPUB/PDF, sanitizzazione testi) |
| **Orchestrazione AI** | n8n (self-hosted) |
| **Modelli AI** | OpenAI GPT-4o mini (testo), DALL-E 3 (immagini) |
| **Database** | Supabase (PostgreSQL + Auth + Storage + RLS) |

## ⚙️ Installazione

1. **Clona il progetto**:
   ```bash
   git clone https://github.com/RiccardoGenco/W4U-Writing-Wizard.git
   cd W4U-Writing-Wizard
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Configura l'ambiente**:
   Crea un file `.env` basandoti su `.env.example`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_N8N_WEBHOOK_URL=/webhook
   VITE_N8N_API_KEY=your-api-key
   VITE_INVITE_CODE=segreto-invito  # Opzionale: se presente, blocca registrazioni senza codice
   ```

4. **Avvia in modalità sviluppo**:
   ```bash
   npm run dev
   ```


## 🤖 Backend n8n

1. Importa `n8n/workflows/W4U_Generate_Cover_DALLE3.json` nella tua istanza n8n
2. Configura le credenziali: **OpenAI API** (`OpenAi account 5`), **Postgres**, **Header Auth**
3. Attiva il workflow

## 📁 Struttura Progetto

```
├── src/
│   ├── pages/auth/        → Login, Register
│   ├── pages/wizard/      → 6 step del wizard
│   ├── pages/Dashboard    → Libreria libri
│   ├── components/        → AuthGuard, LoadingOverlay, Sidebar
│   └── lib/               → api, auth, navigation
├── server/                → Express (export EPUB/PDF)
├── n8n/workflows/         → Workflow AI principale
└── supabase/              → Migrazioni e funzioni DB
```

## 🔐 Sicurezza

- **Autenticazione**: Supabase Auth (email/password)
- **Autorizzazione**: Row Level Security (RLS) su tutte le tabelle
- **Webhook**: Protetti con API Key + JWT validation
- **Audit**: Tabella `audit_log` per tracciamento operazioni
