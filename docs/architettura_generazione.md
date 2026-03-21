# Architettura di Generazione del Testo - W4U Writing Wizard

Questo documento descrive il flusso end-to-end che porta dalla prima idea dell'utente al testo finale del libro, mappando ogni agente, il relativo passaggio logico e l'orchestrazione di sistema. Pone un'enfasi particolare sulla differenziazione tra **Fiction** e **Non-Fiction**, garantendo l'uso di prompt e stili adeguati al genere dell'opera.

## 🗺️ Mappa dell'Architettura (Orchestrata via n8n)

```mermaid
graph TD
    classDef orchestrator fill:#ff9900,stroke:#333,stroke-width:2px;
    classDef human fill:#85c1e9,stroke:#333,stroke-width:2px;
    classDef router fill:#d4edda,stroke:#28a745,stroke-width:2px;
    
    User([Utente]):::human --> |Risposte & Draft| FR[Frontend: ConceptPage]
    FR --> |Workflow n8n| ORCH{Orchestratore n8n}:::orchestrator
    
    ORCH --> |Action: INTERVIEW| AG_INT[Agent: Interviewer]
    ORCH --> |Action: GENERATE_CONCEPTS| AG_CON[Agent: Concept Gen1]
    
    AG_INT --> |Aggiorna| BP[Blueprint JSON]
    AG_CON --> |Genera| BP
    AG_CON --> |Propone| C6[6 Concept Cards]
    
    User --> |Seleziona Concept| FR_CONF[Frontend: Configuration]
    FR_CONF --> ORCH
    
    ORCH --> |Action: OUTLINE| AG_PLOT[Agent: Plotter]
    AG_PLOT --> |Dettaglia| PLOT[Plot Summary]
    
    PLOT --> AG_ARC[Agent: Architect]
    AG_ARC --> |Genera Indice| INDEX[Index / Chapters]
    
    INDEX --> |Approvazione Utente HITL| User
    User --> |Conferma Indice| ORCH
    
    ORCH --> |Action: SCAFFOLD_CHAPTER| AG_SCAFF[Agent: Scaffolder]
    AG_SCAFF --> |Scompone in Blocchi| PARS[Paragraphs / Scenes]
    
    PARS --> |Dynamic Prompt Routing| ROUTER{Style Router}:::router
    ROUTER --> |Fiction| DB_F[(DB: Prompts Narrativi)]
    ROUTER --> |Non-Fiction/Manualistica| DB_NF[(DB: Prompts Tecnici/Analitici)]
    
    DB_F --> |Action: WRITE_F| AG_WRIT[Agent: Writer]
    DB_NF --> |Action: WRITE_NF| AG_WRIT
    
    DB[(Postgres)] --> |Contesto Precedente| AG_WRIT
    RAG[(RAG: Vector DB)] --> |Materiale Bozza| AG_WRIT
    
    AG_WRIT --> |Produce| RAW_TEXT[Bozza Paragrafo]
    
    RAW_TEXT --> |Action: EDIT| AG_ED[Agent: Editor]
    ROUTER --> |Regole di Stile| AG_ED
    AG_ED --> |Feedback (Stile, Coerenza, Allucinazioni)| AG_WRIT
    AG_ED --> |Approva| FINAL_TEXT[Testo Finale Paragrafo]
    
    FINAL_TEXT --> |Action: EXPORT| AG_PUB[Module: Publisher]
    AG_PUB --> |Genera| ARTIFACTS[EPUB / PDF / DOCX]
```

## 🔄 Descrizione dei Passaggi

### 0. Orchestrazione (n8n)
Tutto il flusso di lavoro è coordinato da **n8n**, che gestisce le code, lo stato di avanzamento, le chiamate asincrone e, cosa fondamentale, il **Routing Dinamico dei Prompt** in base al genere dell'opera scambiando dati con Supabase.

### 1. Fase Esplorativa (Intervista & Concept)
L'obiettivo è trasformare l'idea vaga dell'utente in un **Blueprint** tecnico.
- **Interviewer**: Conduce una chat interattiva per riempire i vuoti di trama o struttura.
- **Concept Gen1**: Analizza gli input e propone 6 direzioni diverse (concept). **Passaggio Cruciale**: Qui viene definita la macro-categoria dell'opera (Fiction, Saggistica, Manuale Tecnico, Testo Storico). Questo parametro (`genre` o `category`) viaggerà lungo tutto il flusso.

### 2. Fase Strutturale (Plot & Index)
Una volta scelto il concept, l'IA costruisce le fondamenta strutturali dell'opera.
- **Plotter**: Crea una trama estesa o un'ossatura logico-tematica (per non-fiction).
- **Architect**: Progetta l'indice (capitoli), assicurandosi che il numero di capitoli rispetti il target di pagine impostato.
- **Human-in-the-Loop (HITL)**: L'utente revisiona e approva l'indice generato prima di procedere.

### 3. Fase di Produzione (Scaffold & Write con Style Routing)
Il lavoro viene atomizzato per massimizzare la qualità. Le istruzioni passate ai modelli cambiano radicalmente in base al genere.
- **Scaffolder**: Prende un capitolo e lo divide in scene (fiction) o sezioni logiche/argomentative (non-fiction).
- **Style Router (n8n)**: Legge il `genre` dal Blueprint e interroga la tabella `ai_prompts` (Supabase) per recuperare il system prompt specifico. 
  - *Fiction*: Il prompt istruirà l'IA a usare la regola dello "Show, don't tell", descrizioni sensoriali e dialoghi dinamici.
  - *Non-Fiction / Saggistica*: Il prompt proibirà descrizioni flowery e dialoghi, imponendo un tono accademico, autorevole, chiaro e strutturato, concentrato sulla trasmissione delle informazioni senza abbellimenti letterari.
- **Writer**: L'agente finale. Scrive il testo usando il prompt dinamico appena recuperato, il Blueprint, il contesto locale e gli eventuali dati RAG.

### 4. Fase di Revisione (Editor Loop)
- **Editor dinamico**: Anche l'Editor riceve istruzioni basate sul genere. Se sta valutando un saggio scientifico, i suoi criteri di valutazione penalizzeranno l'uso di aggettivi superflui o toni sensazionalistici, verificando invece la chiarezza espositiva. Se rileva violazioni di queste linee guida, boccia il testo e lo rimanda al Writer. Quando il testo è valido, viene marchiato come finale.

### 5. Fase di Pubblicazione ed Esportazione
- **Publisher**: Un modulo finale che aggrega tutti i "Testi Finali" dei capitoli e genera i file finali scaricabili (PDF, EPUB, DOCX).
