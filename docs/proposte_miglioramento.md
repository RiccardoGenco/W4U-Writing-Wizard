# Proposte di Miglioramento Qualitativo

In base all'analisi dell'architettura e dei prompt attuali, ecco i punti chiave su cui intervenire per elevare la qualità della scrittura automatica.

## 1. Upgrade dei Modelli (Intelligence Tiering)
Attualmente il sistema si appoggia massicciamente su `gpt-4o-mini`. 
- **Proposta**: Utilizzare modelli più capaci per i nodi critici.
    - **Plotter & Architect**: Passare a `gpt-4o` o `o3-mini` per una struttura narrativa più solida e meno cliché.
    - **Writer**: Utilizzare `gpt-4o` (standard) per la fase di scrittura finale o, per la narrativa di alta qualità, testare `Claude 3.5 Sonnet` (noto per uno stile più umano e meno "AI-ish").
    - **Editor**: Un modello superiore (`o1`) potrebbe individuare molte più sfumature di stile e coerenza.

## 2. Implementazione del Chain of Thought (CoT)
Molti prompt attuali sono diretti ("Fai X").
- **Proposta**: Modificare i prompt dei nodi `Plotter` e `Architect` includendo una fase di "ragionamento prima dell'output". Chiedere all'IA di analizzare prima il genere e le aspettative del lettore, e poi generare il contenuto.

## 3. Rafforzamento del RAG (Recupero Creativo)
Il sistema RAG attuale recupera i chunk della bozza utente e li "inietta" nel prompt dello scrittore.
- **Proposta**: Invece di iniettare solo i chunk grezzi, creare un passo intermedio (`Style Extractor`) che analizzi la bozza utente per estrarre lo *stile specifico* (lessico utilizzato, ritmo delle frasi) e lo passi come istruzione esplicita al `Writer`.

## 4. Gestione Dinamica della Lunghezza
La forzatura a "ESATTAMENTE 250 PAROLE" spesso danneggia il ritmo.
- **Proposta**: Dare un range (es. 200-400 parole) e istruire il `Writer` a dare priorità alla chiusura logica della scena/argomento piuttosto che al conteggio esatto, delegando allo `Scaffolder` una stima più precisa di quante scene servono davvero per coprire il capitolo.

## 5. Feedback Loop "Umano-in-the-loop"
- **Proposta**: Permettere all'utente di rigenerare un singolo paragrafo fornendo un feedback testuale immediato ("Troppo descrittivo", "Più dialogo", "Sii più tecnico"), che venga iniettato nel prompt di rigenerazione.

## 6. Prompt Engineering Avanzato (Few-Shot)
- **Proposta**: Inserire nel prompt del `Writer` degli esempi di "scrittura eccellente" per ogni genere (Few-shot prompting). Mostrare all'IA un esempio di saggistica di alta qualità vs narrativa immersiva aiuta il modello a calibrare meglio il tono rispetto ad una semplice istruzione di sistema.
