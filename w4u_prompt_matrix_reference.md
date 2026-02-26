# Guida Architettura Prompts: Matrice dei Generi W4U
Questo documento illustra l'intera pipeline generativa del progetto **W4U Writing Wizard**, mappando come le istruzioni dell'Intelligenza Artificiale (N8N) mutino dinamicamente in base alla tipologia di libro (Fiction vs Non-Fiction) e ai relativi sottogeneri individuati.

---

## 🧭 1. Fase Iniziale: L'Intervistatore (`Agent: Interviewer`)

L'Intervista Iniziale determina la base del progetto (il **Blueprint**) e raccoglie fatti chiave chiacchierando con l'utente. 

**Logica Condizionale sul Genere:**
- 📕 **SE FICTION (Narrativa, Romanzi, Gialli, Fantasy, Sci-Fi):**
  L'agente non farà domande tecniche, ma si concentrerà a definire e aggiornare il JSON estraendo: `ambientazione, personaggi, atmosfera, ritmo`.
- 📗 **SE NON-FICTION (Saggi, Guide, Manuali, Ricettari):**
  L'agente non fa domande sui personaggi, o sulla prosa teatrale ma indaga su: `target, problemi da risolvere, concetti tecnici, struttura logica`.

**Prompt di Output JSON:**
```json
{ 
  "question": "[Prossima domanda in stile discorsivo]", 
  "blueprint": { 
    "setting_or_target": "...", 
    "characters_or_problems": "...", 
    "plot_vibes_or_structure": "...", 
    "themes": "..." 
  } 
}
```

---

## 🧠 2. Fase Architetturale: Generazione Concept (`Agent: Concept Gen1`)

A fine intervista, vengono fuse le informazioni per dare all'utente 6 direzioni diverse su come potrebbe evolvere il suo progetto.

**Numero Fisso di Proposte:** 
Forzatura assoluta a generare **6 diverse e distinte proposte**. (In precedenza erano bloccate a 4).

**Variabili di Contesto per il Blueprint Tecnico:**
- 📕 **FICTION:** Compila i campi usando: *ambientazione, personaggi, atmosfera.*
- 📗 **NON-FICTION:** Compila i campi usando: *target audience, problemi risolti, struttura logica, concetti chiave.*

---

## 🛠️ 3. Fase Impaginazione: Lo Scaffolder (`Agent: Scaffolder`)

Questa è la fase centrale che prende il sommario di un Capitolo e lo fa a pezzetti definendo quanti paragrafi e *che tipo* di contenuto dovrà generare lo scrittore successivamente. Lo Scaffolder suddivide il capitolo in base al genere impiegato:

- 📗 **Saggistica / Manualistica / Guide (Non-Fiction base):**
  L'IA strutturerà i 10-20 paragrafi secondo questa tassonomia:
  *Introduzione, Argomentazioni Logiche, Dati, Sottocapitoli tematici, Risultati.*
- 🍳 **Cucina / Ricettari (Non-Fiction specifico):**
  L'IA suddividerà il lavoro in moduli procedurali:
  *Ingredienti, Strumenti, Step di preparazione step-by-step, Valori nutrizionali.*
- 📕 **Narrativa (Romance, SciFi, Thriller, Gialli):**
  L'IA frazionerà il capitolo in veri e propri segmenti narrativi (scene):
  *Incidenti scatenanti, plot twist, esplorazione, dialoghi risolutivi, indizi, cliffhanger.*

---

## ✍️ 4. Fase Scrittura: Lo Scrittore (`Agent: Writer`)

L'agente più importante: riceve il numero del paragrafo, cosa deve accaderci dentro, preleva i segmenti di testo precedentemente generati (per mantenere la memoria temporale/linguistica) e stampa circa 1000/1500 caratteri definitivi.

**La Regola d'Oro del Writer - La Matrice Esplicita:**
Il prompt principale modula radicalmente lo stile di scrittura proibendo severamente certe pratiche.

1. 📗 **NON-FICTION / Saggistica / Manuali / Guide / Accademici:**
   - **Stile:** Informativo Rigoroso e Autorevole.
   - **Regole Negative Forti:** Assolutamente **vietata** ogni forma di narrazione romanzata, la regola dello "show, don't tell", intro poetiche e personaggi d'invenzione fittizi.
   - **Focus:** Accuratezza tecnica, spiegazione dei concetti teorici, elenchi procedurali, strategie, riferimenti accademici e logica analitica.

2. 🍳 **CUCINA E RICETTARI:**
   - **Stile:** Procedurale / Chirurgico.
   - **Focus:** Assoluta e inamovibile categorizzazione, elenchi stringenti con unità di misura esatte. Dritto al punto logistico.

3. 📕 **FICTION (Romanzi, Gialli, Sci-Fi, Romance, Fantasy):**
   - **Stile:** Narrativo Immersivo.
   - **Focus:** Paradigma "*show, don't tell*" applicato spietatamente. Descrizioni sensoriali estese. Cura nell'interiorità dei personaggi (desideri, ansie). 
     - *Per Thriller/Gialli:* Massima cura sulla Tensione.
     - *Per SciFi/Fantasy:* Focus sul world-building e/o architettura del sistema magico pseudo-realistico.
     - *Romance:* Introspezione emotiva ed interazioni umane (chimica tra i personaggi).
   - **Struttura:** Ampio uso di dialoghi realistici.

---

## 🎨 5. Fase Grafica: Copertina (`Prepare Cover Prompt`)

La copertina, anziché essere generata dall'IA con testo "allucinato" e spesso errato, oppure restituita come una foto tridimensionale di appoggiato su un tavolo di legno (mockup), è ora soggetta alle seguenti esplicite istruzioni castranti:

`FLAT 2D ARTWORK ONLY. ABSOLUTELY NO TEXT, NO TYPOGRAPHY, NO FONTS, NO LETTERS. DO NOT draw a physical book object. DO NOT include book pages, spine, hands holding a book, or a background table.`

Il risultato è esplicitamente la pura *illustrazione pittorica (o grafica digitale vectoriale nel caso dei manuali professionali)*. Eventuali titoli e nomi dell'autore andranno montati successivamente dalla nostra applicazione sulla base generata.

**Override degli Stili Visivi (DALL-E 3):**
Lo stile inviato a DALL-E si pre-formatta in base al genere:
- **Romance:** soft romantic lighting, dreamy atmosphere, elegant flat illustration
- **Thriller:** dark moody lighting, suspenseful composition, cinematic illustration
- **Sci-Fi:** futuristic, sci-fi concept art, technological elements
- **Saggi/Manuali:** minimalist graphic design, corporate minimalist, abstract geometric, flat design vector art
- **Cucina:** beautiful food illustration, flat lay aesthetic, bright warm colors
- **Fantasy:** epic fantasy art, magical atmosphere, mystical elements, digital painting
