const fs = require("fs");
const filePath = "C:/Users/genco/Desktop/lavoro/w4uN8N/n8n/workflows/w4u_workflow.json";
let data = fs.readFileSync(filePath, "utf8");

try {
    const workflow = JSON.parse(data);
    for (const node of workflow.nodes) {
        if (node.name === "Agent: Writer") {
            // This is the ultra-safe, pre-flattened string without a single literal newline inside it.
            // All newlines are correctly escaped as \\n
            const safeString = `={{ { "model": "gpt-4o-mini", "max_tokens": 8000, "messages": [ { "role": "system", "content": "Sei uno scrittore professionista. Stai scrivendo il PARAGRAFO " + $('Get Paragraph').first().json.paragraph_number + ". NON USARE MAI EMOJI IN NESSUNA CIRCOSTANZA.\\n\\n" + "BLUEPRINT (CONTESTO MACRO):\\n" + JSON.stringify($('Get Book').first().json.context_data?.blueprint || {}) + "\\n\\n" + "DETTAGLI CAPITOLO:\\n" + "- Titolo: " + ($('Get Paragraph').first().json.chapter_title || "Senza Titolo") + "\\n" + "- Sommario: " + ($('Get Paragraph').first().json.chapter_summary || "Nessun sommario") + "\\n\\n" + "DETTAGLI QUESTO PARAGRAFO:\\n" + "- Argomento: " + ($('Get Paragraph').first().json.title || "") + "\\n" + "- Cosa deve succedere qui: " + ($('Get Paragraph').first().json.description || "Scrivi il contenuto adatto.") + "\\n\\n" + "CONTESTO PARAGRAFI PRECEDENTI:\\n" + ($('Get Previous Paragraphs Context').first().json.combined_content ? $('Get Previous Paragraphs Context').first().json.combined_content : "Ogni inizio porta con se una genesi. Nessun paragrafo precedente ancora.") + "\\n\\n" + "MATERIALE BOZZA ESTRAPOLATO:\\n" + ($('RAG: Query Draft Chunks').all().map(item => item.json && item.json.content ? item.json.content : "").filter(x => x).join("\\n\\n") || "Nessun materiale.") + "\\n\\n" + "ISTRUZIONI DI SCRITTURA:\\n" + "REGOLE DI SCRITTURA (ADATTATI ALLA CATEGORIA DEL LIBRO CON CURA MANIACALE):\\n\\n1. NON-FICTION / Saggistica / Manuali / Guide: STILE INFORMATIVO RIGOROSO E AUTOREVOLE. CRITICAL RULE: È ASSOLUTAMENTE VIETATA ogni forma di narrazione romanzata, storytelling, \\"show, don't tell\\", intro poetiche, aneddoti romanzati e personaggi d'invenzione fittizi. NON INIZIARE MAI i paragrafi raccontando una storiella. Usa un tono freddo, oggettivo, consulenziale, tecnico. Concentrati sull'accuratezza tecnica: spiega i concetti, elenca step procedurali, usa elenchi puntati se utile.\\n\\n2. CUCINA E RICETTARI: STILE PROCEDURALE CRITICAL LOGIC.\\n\\n3. FICTION (Romanzi, Gialli, Sci-Fi, Romance, Fantasy): STILE NARRATIVO IMMERSIVO. Applica 'show, don\\'t tell'. Focus assoluto sulle descrizioni sensoriali, interiorità, archi drammatici e passioni.\\n\\nIstruzione finale: Scrivi SOLO il testo per questa sezione ed espandilo riccamente in modo definitivo (minimo 1500 caratteri o più).\\n" + "- Assicurati che il collegamento con i paragrafi precedenti sia fluido e logico." }, { "role": "user", "content": "Scrivi il contenuto per il Paragrafo: " + $('Get Paragraph').first().json.title } ] } }}`;

            node.parameters.jsonBody = safeString;
            console.log("Successfully replaced the Writer jsonBody with the ultra-safe flat string.");
        }
    }
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.log("File saved.");
} catch (e) {
    console.error("Error parsing/writing:", e);
}
