import json

file_path = r"C:\Users\genco\Desktop\lavoro\w4uN8N\n8n\workflows\w4u_workflow.json"

with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

# The user string exactly as they pasted it 
user_str = """={{ { "model": "gpt-4o-mini", "max_tokens": 8000, "messages": [ { "role": "system", "content": "Sei uno scrittore professionista. Stai scrivendo il PARAGRAFO " + $('Get Paragraph').first().json.paragraph_number + ". NON USARE MAI EMOJI IN NESSUNA CIRCOSTANZA.\n\n" + "BLUEPRINT (CONTESTO MACRO):\n" + JSON.stringify($('Get Book').first().json.context_data?.blueprint || {}) + "\n\n" + "DETTAGLI CAPITOLO:\n" + "- Titolo: " + ($('Get Paragraph').first().json.chapter_title || "Senza Titolo") + "\n" + "- Sommario: " + ($('Get Paragraph').first().json.chapter_summary || "Nessun sommario") + "\n\n" + "DETTAGLI QUESTO PARAGRAFO:\n" + "- Argomento: " + ($('Get Paragraph').first().json.title || "") + "\n" + "- Cosa deve succedere qui: " + ($('Get Paragraph').first().json.description || "Scrivi il contenuto adatto.") + "\n\n" + "CONTESTO PARAGRAFI PRECEDENTI:\n" + ($('Get Previous Paragraphs Context').first().json.combined_content ? $('Get Previous Paragraphs Context').first().json.combined_content : "Ogni inizio porta con se una genesi. Nessun paragrafo precedente ancora.") + "\n\n" + "MATERIALE BOZZA ESTRAPOLATO:\n" + ($('RAG: Query Draft Chunks').all().map(item => item.json && item.json.content ? item.json.content : "").filter(x => x).join("\n\n") || "Nessun materiale.") + "\n\n" +\n "ISTRUZIONI DI SCRITTURA:\n" + "REGOLE DI SCRITTURA (ADATTATI ALLA CATEGORIA DEL LIBRO CON CURA MANIACALE):\n\n1. NON-FICTION / Saggistica / Manuali / Guide: STILE INFORMATIVO RIGOROSO E AUTOREVOLE. CRITICAL RULE: È ASSOLUTAMENTE VIETATA ogni forma di narrazione romanzata, storytelling, \"show, don't tell\", intro poetiche, aneddoti romanzati e personaggi d'invenzione fittizi. NON INIZIARE MAI i paragrafi raccontando una storiella. Usa un tono freddo, oggettivo, consulenziale, tecnico. Concentrati sull'accuratezza tecnica: spiega i concetti, elenca step procedurali, usa elenchi puntati se utile.\n\n2. CUCINA E RICETTARI: STILE PROCEDURALE CRITICAL LOGIC.\n\n3. FICTION (Romanzi, Gialli, Sci-Fi, Romance, Fantasy): STILE NARRATIVO IMMERSIVO. Applica 'show, don\'t tell'. Focus assoluto sulle descrizioni sensoriali, interiorità, archi drammatici e passioni.\n\nIstruzione finale: Scrivi SOLO il testo per questa sezione ed espandilo riccamente in modo definitivo (minimo 1500 caratteri o più).\n" + "- Assicurati che il collegamento con i paragrafi precedenti sia fluido e logico." }, { "role": "user", "content": "Scrivi il contenuto per il Paragrafo: " + $('Get Paragraph').first().json.title } ] } }}"""

# We strip out the literal \n character that's breaking the expression parser
safe_str = user_str.replace("\n", " ")

for node in data.get("nodes", []):
    if node.get("name") == "Agent: Writer":
        node["parameters"]["jsonBody"] = safe_str
        print("Replaced jsonBody for Agent: Writer")

with open(file_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print("Workflow saved.")
