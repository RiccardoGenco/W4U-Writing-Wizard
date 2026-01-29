# W4U Writing Wizard 

W4U Writing Wizard è un assistente alla scrittura potenziato dall'intelligenza artificiale che guida l'autore dalla fase di ideazione fino alla produzione del manoscritto completo.

## 🚀 Novità e Ottimizzazioni

- **W4U Wizard Branding**: Rinnovata l'identità dell'agente nel frontend.
- **Sanitizzazione Centralizzata**: Nuovo endpoint `/api/sanitize` per pulizia testo coerente (casistica editoriale, rimozione emoji).
- **Export UX Migliorata**: Gestione errori inline e feedback visivo avanzato durante la generazione PDF/EPUB.
- **Configurazione Dinamica**: Integrazione colonna `configuration` nel database per impostazioni personalizzate per ogni libro.

## ✨ Funzionalità

- **Wizard Flow**: Un percorso guidato in più step per definire Titolo, Genere e Target.
- **Intervista AI**: Un agente intelligente ti aiuta a raffinare il concetto del tuo libro.
- **Architetto Letterario**: Generazione automatica di un indice capitoli basato su tono e stile scelti.
- **Editor Gerarchico**: Interfaccia di scrittura organizzata per Capitoli e Paragrafi.
- **Export Multi-formato**: Generazione di file digitali (EPUB, PDF), analogici e anteprime PNG.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Framer Motion, Lucide React.
- **Backend (Node.js)**: Server Express per export EPUB e sanitizzazione testi.
- **Orchestrazione (n8n)**: Gestione workflow agenti AI via OpenRouter.
- **Database (Supabase)**: Persistence dati, configurazioni e log di debug.

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
   Crea un file `.env` basandoti su `.env.example` con le tue chiavi Supabase e l'URL del webhook n8n.

4. **Avvia in modalità sviluppo**:
   ```bash
   npm run dev
   ```

## 🤖 Backend (n8n)
Importa l'ultimo file `AI Book Generator - Wizard Flow V3.json` nella tua istanza n8n per attivare gli agenti ottimizzati.

