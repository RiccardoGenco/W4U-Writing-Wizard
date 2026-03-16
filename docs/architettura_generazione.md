# Architettura di Generazione del Testo - W4U Writing Wizard

Questo documento descrive il flusso end-to-end che porta dalla prima idea dell'utente al testo finale del libro, mappando ogni agente e il relativo passaggio logico.

## 🗺️ Mappa dell'Architettura

```mermaid
graph TD
    User([Utente]) --> |Risposte & Draft| FR[Frontend: ConceptPage]
    FR --> |Action: INTERVIEW| AG_INT[Agent: Interviewer]
    FR --> |Action: GENERATE_CONCEPTS| AG_CON[Agent: Concept Gen1]
    
    AG_INT --> |Aggiorna| BP[Blueprint JSON]
    AG_CON --> |Genera| BP
    AG_CON --> |Propone| C6[6 Concept Cards]
    
    User --> |Seleziona Concept| FR_CONF[Frontend: Configuration]
    FR_CONF --> |Action: OUTLINE| AG_PLOT[Agent: Plotter]
    AG_PLOT --> |Dettaglia| PLOT[Plot Summary]
    
    PLOT --> AG_ARC[Agent: Architect]
    AG_ARC --> |Genera Indice| INDEX[Index / Chapters]
    
    INDEX --> |Action: SCAFFOLD_CHAPTER| AG_SCAFF[Agent: Scaffolder]
    AG_SCAFF --> |Scompone| PARS[Paragraphs / Scenes]
    
    PARS --> |Action: WRITE_PARAGRAPH| AG_WRIT[Agent: Writer]
    DB[(Postgres)] --> |Contesto Precedente| AG_WRIT
    RAG[(RAG: Vector DB)] --> |Materiale Bozza| AG_WRIT
    
    AG_WRIT --> |Produce| FINAL_TEXT[Testo Finale Paragrafo]
    
    FINAL_TEXT --> |Opzionale| AG_ED[Agent: Editor]
    AG_ED --> |Revisione| FINAL_TEXT
```

## 🔄 Descrizione dei Passaggi

### 1. Fase Esplorativa (Intervista & Concept)
L'obiettivo è trasformare l'idea vaga dell'utente in un **Blueprint** tecnico.
- **Interviewer**: Conduce una chat interattiva per riempire i vuoti di trama o struttura.
- **Concept Gen1**: Analizza gli input e propone 6 direzioni diverse (concept). Qui viene definito se il libro è Fiction o Non-Fiction, influenzando tutti i passaggi successivi.

### 2. Fase Strutturale (Plot & Index)
Una volta scelto il concept, l'IA costruisce le fondamenta.
- **Plotter**: Crea una trama estesa e coerente.
- **Architect**: Progetta l'indice (capitoli), assicurandosi che il numero di capitoli rispetti il target di pagine impostato.

### 3. Fase di Produzione (Scaffold & Write)
Il lavoro viene atomizzato per massimizzare la qualità e gestire i limiti di contesto dei modelli.
- **Scaffolder**: Prende un capitolo e lo divide in scene (fiction) o sezioni logiche (non-fiction). Questo assicura che lo scrittore abbia compiti precisi di circa 250 parole.
- **Writer**: L'agente finale. Scrive il testo usando:
    - **Blueprint**: Per mantenere lo stile e i temi.
    - **Contesto Locale**: I paragrafi immediatamente precedenti per la fluidità.
    - **RAG**: Frammenti della bozza originale caricata dall'utente (se presente).

### 4. Fase di Revisione
- **Editor**: Analizza il testo generato alla ricerca di incongruenze o errori, fornendo suggerimenti all'utente.
