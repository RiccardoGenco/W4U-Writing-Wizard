# Analisi Prompts Dettagliata

Questo documento riporta i prompt esatti estratti dal workflow n8n, suddivisi per agente, con un'analisi del loro ruolo nel processo qualitativo.

## 1. Agent: Interviewer (Affinamento Idea)
**Ruolo**: Interagisce con l'utente per popolare il Blueprint.
**Prompt (System)**:
> "Sei un editor letterario professionale italiano... Il tuo compito è intervistare l'utente... indaga su ambientazione, personaggi, atmosfera, ritmo (FICTION) o target, problemi, concetti tecnici (NON-FICTION)... CHIEDI UNA COSA ALLA VOLTA."
**Output JSON**: `{ "question": "...", "blueprint": { ... } }`

## 2. Agent: Concept Gen1 (Generazione Proposte)
**Ruolo**: Crea il Blueprint tecnico iniziale e 6 proposte.
**Prompt (System)**:
> "...Generare un BLUEPRINT tecnico... CRITICAL MANDATORY RULE: Generare ESATTAMENTE 6 (SEI) diverse e distinte proposte di Concept Cards... Se generi meno di 6 concept, fallirai irrimediabilmente il task."
**Output JSON**: `{ "blueprint": { ... }, "concepts": [ ... ] }`

## 3. Agent: Plotter (Sviluppo Trama)
**Ruolo**: Genera la narrazione estesa basata sul Concept selezionato.
**Prompt (System)**:
> "Sei un Master Plotter. Crea una trama dettagliata basata sul BLUEPRINT del libro... Genera una trama coerente con questi elementi."
**Nota**: Utilizza `gpt-4o-mini` con temperature variabile (default 0.2).

## 4. Agent: Architect (Progettazione Indice)
**Ruolo**: Crea l'indice dei capitoli.
**Prompt (System)**:
> "Sei l'Architetto Letterario W4U. Il tuo compito è creare o MODIFICARE l'indice di un libro... DEVI GENERARE ESATTAMENTE [num_chapters] CAPITOLI... NEMMENO UNO IN PIU' O IN MENO."
**Input**: Riceve il numero di capitoli calcolato matematicamente in base alle pagine target.

## 5. Agent: Scaffolder (Scomposizione Capitolo)
**Ruolo**: Divide il capitolo in paragrafi atomici.
**Prompt (System)**:
> "Sei l'Architetto Letterario W4U. Il tuo compito è spezzettare un Capitolo in ESATTAMENTE [targetCount] Sottocapitoli... Dividi il capitolo in base al GENERE: Saggistica (Argomentazioni logiche), Cucina (Modulo procedurale), Narrativa (Scene narrative)."

## 6. Agent: Writer (La Penna)
**Ruolo**: Scrive il testo finale. È il cuore della qualità.
**Prompt (System) - Sintesi**:
> "...Sei uno scrittore professionista... ISTRUZIONI DI SCRITTURA: REGOLE DI SCRITTURA (ADATTATI ALLA CATEGORIA):
> 1. NON-FICTION: Stile informativo rigoroso. ASSOLUTAMENTE VIETATA narrazione romanzata, storytelling, show dont tell.
> 2. FICTION: Stile narrativo immersivo. Applica show dont tell... Focus sensoriale, interiorità...
> TARGET LUNGHEZZA: ESATTAMENTE [target_word_count] PAROLE."
**Input context**: Blueprint + Dettagli Capitolo + Dettagli Paragrafo + Contesto Paragrafi Precedenti + Materiale RAG.

## 🔎 Analisi Critica Qualitativa
1. **Modello**: Attualmente quasi tutti i nodi usano `gpt-4o-mini`. Sebbene efficiente, manca della profondità "letteraria" e di ragionamento di modelli come `gpt-4o` (standard) o `o1/o3`.
2. **Lunghezza**: Il Writer è forzato a lunghezze specifiche ("ESATTAMENTE 250 PAROLE"), il che può portare a riempitivi (filler) o troncamenti se il paragrafo ha poco o troppo contenuto.
3. **Contesto**: Il contesto dei paragrafi precedenti è limitato (viene passata una `combined_content` di quelli passati). In libri lunghi, la coerenza a lungo raggio potrebbe perdersi se il Blueprint non è estremamente dettagliato.
