# W4U Writing Wizard 

W4U Writing Wizard è un assistente alla scrittura potenziato dall'intelligenza artificiale che guida l'autore dalla fase di ideazione fino alla produzione del manoscritto completo.

##  Funzionalità

- **Wizard Flow**: Un percorso guidato in più step per definire Titolo, Genere e Target.
- **Intervista AI**: Un agente intelligente ti aiuta a raffinare il concetto del tuo libro.
- **Architetto Letterario**: Generazione automatica di un indice capitoli basato su tono e stile scelti.
- **Editor Gerarchico**: Interfaccia di scrittura organizzata per Capitoli e Paragrafi.
- **Export Multi-formato**: Generazione di file digitali, analogici e anteprime PNG.

##  Tech Stack

- **Frontend**: React, Vite, Framer Motion, Lucide React.
- **Backend**: [n8n](https://n8n.io/) per l'orchestrazione degli agenti AI (OpenRouter).
- **Database**: [Supabase](https://supabase.com/) per la persistenza dei dati e i log di debug.

##  Installazione

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

##  Backend (n8n)
Importa il file `workflow_v2.json` nella tua istanza n8n per attivare gli agenti AI e i webhook di collegamento con il database.
