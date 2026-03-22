import json

file_path = "n8n/workflows/w4u_workflow.json"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

for node in data.get("nodes", []):
    if node.get("name") == "Prepare Writer Payload":
        js_code = node.get("parameters", {}).get("jsCode", "")
        
        if "paragraphRange" not in js_code:
            insertion_point = "if (!Array.isArray(paragraphs) || paragraphs.length === 0) {\n  throw new Error('No scaffold paragraphs found for chapter writer');\n}"
            new_logic = """if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
  throw new Error('No scaffold paragraphs found for chapter writer');
}

// FILTER PARAGRAPHS BASED ON RANGE (SPLIT CHAPTER LOGIC)
const range = webhook.paragraphRange;
let targetParagraphs = paragraphs;
if (Array.isArray(range) && range.length === 2) {
  targetParagraphs = paragraphs.filter(p => p.paragraph_number >= range[0] && p.paragraph_number <= range[1]);
  if (targetParagraphs.length === 0) {
     throw new Error(`No paragraphs found in range ${range[0]}-${range[1]}`);
  }
}"""
            js_code = js_code.replace(insertion_point, new_logic)
            
            # replace outline generation logic
            js_code = js_code.replace("const safeTargetWordCount = Number.isFinite(targetWordCount) && targetWordCount > 0 ? Math.round(targetWordCount) : Math.max(1200, paragraphs.length * 250);", 
                                      "const safeTargetWordCount = Number.isFinite(targetWordCount) && targetWordCount > 0 ? Math.round(targetWordCount) : Math.max(1200, targetParagraphs.length * 250);")
            js_code = js_code.replace("const outlineStr = paragraphs.map", "const outlineStr = targetParagraphs.map")
            js_code = js_code.replace("expectedParagraphs: paragraphs.length", "expectedParagraphs: targetParagraphs.length")
            
            # update the prompt string to explicitly state part logic
            js_code = js_code.replace("'TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN ORDINE:',", 
                                      "`TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE (${webhook.partNumber || 1}/${webhook.totalParts || 1}):`,")
            
            # replace final chapter reference if any
            js_code = js_code.replace("const chapter = paragraphs[0]", "const chapter = targetParagraphs[0]")
            
            node["parameters"]["jsCode"] = js_code

with open(file_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Patch applied successfully.")
