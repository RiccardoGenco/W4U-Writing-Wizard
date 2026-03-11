import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let patchedCount = 0;

workflow.nodes.forEach(n => {
    if (n.name === 'Agent: Scaffolder' && n.parameters && n.parameters.jsonBody) {
        
        // The user's prompt string:
        // "content": "Sei l'Architetto Letterario W4U. Il tuo compito è spezzettare un Capitolo in ESATTAMENTE " + ($node["Webhook Router"].json.body.targetParagraphCount || 10) + " Sottocapitoli...
        // This fails for two reasons:
        // 1. Mixing literal strings inside `{{ ... }}` and outside. n8n v1 expects `{{ expression }}` logic without string concatenation + inside JSON if formatted incorrectly.
        // 2. Node evaluation crashes in manual testing.
        
        // The new prompt uses n8n templating and safe lookups for Webhook Router.
        // It also checks for the `Calculator` node just in case it was run before this.
        
        const newSystemPrompt = `Sei l'Architetto Letterario W4U. Il tuo compito è spezzettare un Capitolo in ESATTAMENTE {{ $('Webhook Router').first().json?.body?.targetParagraphCount || $('Calculator').first().json?.paragraphs_per_chapter || 5 }} Sottocapitoli (chiamati Paragrafi).

IMPORTANTE: RISPONDI SOLO CON UN OGGETTO JSON. NESSUN TESTO INTRODUTTIVO. NON USARE MAI EMOJI.

TITOLO CAPITOLO: {{ $('Webhook Router').first().json?.body?.chapter?.title || $json.title || 'Sconosciuto' }}
SOMMARIO CAPITOLO: {{ $('Webhook Router').first().json?.body?.chapter?.summary || $json.summary || 'Nessun sommario' }}

FEEDBACK UTENTE (se presente): {{ $('Webhook Router').first().json?.body?.feedback || 'Nessun feedback. Genera da zero.' }}

ISTRUZIONI:
- Dividi il capitolo in ESATTAMENTE {{ $('Webhook Router').first().json?.body?.targetParagraphCount || $('Calculator').first().json?.paragraphs_per_chapter || 5 }} paragrafi in base al GENERE:
  -- Saggistica/Manuale/Informativo: Introduzione, Argomentazioni Logiche, Dati, Sottocapitoli tematici.
  -- Ricettario: Ingredienti, Strumenti, Step preparazione, Valori.
  -- Narrativa (Romance, SciFi, Thriller): Scene narrative (incidenti scatenanti, plot twist, esplorazione).
- Ogni paragrafo dovrà poi essere usato per generare un blocco di circa 250 parole.
- CRITICAL RULE: DEVI GENERARE ESATTAMENTE {{ $('Webhook Router').first().json?.body?.targetParagraphCount || $('Calculator').first().json?.paragraphs_per_chapter || 5 }} PARAGRAFI. NON UNO DI PIU', NON UNO DI MENO.
- Restituisci un array JSON di queste scene.

Output JSON: { "paragraphs": [ { "paragraph_number": 1, "title": "Titolo Scena...", "description": "Descrizione super dettagliata..." } ] }`;

        // We replace the entire messages array safely.
        try {
            // First we must parse the user's broken jsonBody wrapper to rewrite it cleanly
            // Since it's corrupted, we'll just reconstruct the entire JSON payload for OpenAI natively.
            
            const newJsonBody = {
              "model": "gpt-4o-mini",
              "max_tokens": 8000,
              "response_format": { "type": "json_object" },
              "messages": [
                {
                  "role": "system",
                  "content": newSystemPrompt
                }
              ]
            };
            
            // To embed expressions in n8n json parser, we prepend '=' and stringify the non-expression parts
            // Wait, in n8n, if you use "Specify Body: json", it evaluates the whole string as literal JSON EXCEPT where there are {{ }} markers!
            n.parameters.jsonBody = '=' + JSON.stringify(newJsonBody, null, 2).replace(/\\n/g, '\n');
            patchedCount++;
        } catch (e) {
            console.error('Failed to parse Agent: Scaffolder logic', e);
        }
    }
});

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
console.log(`Patched ${patchedCount} Scaffolder nodes.`);
