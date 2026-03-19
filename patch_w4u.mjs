import fs from 'fs';
import { randomUUID } from 'crypto';

try {
  const file = 'n8n/workflows/w4u_workflow.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (data.connections['Async Action Router'] && data.connections['Async Action Router'].main[6]) {
    data.connections['Async Action Router'].main[6] = [
      { "node": "Get Book Context Chapter Writer", "type": "main", "index": 0 }
    ];
  }

  const newNames = [
    "Get Book Context Chapter Writer", 
    "Get Chapter Paragraphs", 
    "Prepare Writer Payload", 
    "Agent: Chapter Writer", 
    "Sanitize Chapter JSON", 
    "Update Chapter Paragraphs Bulk", 
    "Mark Chapter Completed"
  ];
  data.nodes = data.nodes.filter(n => !newNames.includes(n.name));

  const n1 = {
    "parameters": {
      "operation": "executeQuery",
      "query": "SELECT b.*, s.value as primary_model, jsonb_object_agg(p.name, p.prompt_text) as prompts, jsonb_object_agg(p.name, p.temperature) as temps FROM books b CROSS JOIN (SELECT value FROM ai_settings WHERE key = 'primary_model') s LEFT JOIN LATERAL (  SELECT DISTINCT ON (name) name, prompt_text, temperature   FROM ai_prompts   WHERE is_active = true AND (genre = b.genre OR genre = 'GENERAL')   ORDER BY name, (genre = b.genre) DESC, created_at DESC) p ON true WHERE b.id = $1::uuid GROUP BY b.id, s.value",
      "options": { "queryReplacement": "={{ [$node[\"Webhook Router\"].json.body.bookId] }}" }
    },
    "id": randomUUID(),
    "name": "Get Book Context Chapter Writer",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2,
    "position": [0, 1600],
    "credentials": { "postgres": { "id": "0AsoTCNHEls3AaYu", "name": "Postgres account" } }
  };

  const n2 = {
    "parameters": {
      "operation": "executeQuery",
      "query": "SELECT * FROM paragraphs WHERE chapter_id = $1::uuid ORDER BY paragraph_number ASC",
      "options": { "queryReplacement": "={{ [$node[\"Webhook Router\"].json.body.chapterId] }}" }
    },
    "id": randomUUID(),
    "name": "Get Chapter Paragraphs",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2,
    "position": [200, 1600],
    "credentials": { "postgres": { "id": "0AsoTCNHEls3AaYu", "name": "Postgres account" } }
  };

  const n_prepare = {
    "parameters": {
      "mode": "runOnceForAllItems",
      "jsCode": `const paragraphs = $items("Get Chapter Paragraphs").map(i => i.json);
const context = $node["Get Book Context Chapter Writer"].json;
const webhook = $node["Webhook Router"].json.body;

const model = context.primary_model || "gpt-4o";
const temperature = context.temps.CHAPTER_WRITER || 0.7;
const systemPrompt = context.prompts.CHAPTER_WRITER || "Sei un autore.";

const outlineStr = paragraphs.map(p => \`- Sottocapitolo \${p.paragraph_number}: \${p.title}\\n  Descrizione: \${p.description}\`).join('\\n');
const blueprintStr = JSON.stringify(context.context_data.blueprint || {});

const userPrompt = \`BLUEPRINT: \${blueprintStr}\\n\\nOUTLINE SOTTOCAPITOLI PREVISTI:\\n\${outlineStr}\\n\\nOBIETTIVO PAROLE: DEVI raggiungere un target prestabilito di pagine. Per fare questo, assicurati di generare ALMENO \${webhook.targetWordCount || 2500} parole complessive. Sii super dettagliato narrativamente.\`;

return [{
  json: {
    model,
    temperature,
    systemPrompt,
    userPrompt
  }
}];`
    },
    "id": randomUUID(),
    "name": "Prepare Writer Payload",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [400, 1600]
  };

  const n3 = {
    "parameters": {
      "method": "POST",
      "url": "https://api.openai.com/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "openAiApi",
      "sendHeaders": true,
      "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ { \"model\": $node[\"Prepare Writer Payload\"].json.model, \"temperature\": $node[\"Prepare Writer Payload\"].json.temperature, \"response_format\": { \"type\": \"json_object\" }, \"messages\": [ { \"role\": \"system\", \"content\": $node[\"Prepare Writer Payload\"].json.systemPrompt }, { \"role\": \"user\", \"content\": $node[\"Prepare Writer Payload\"].json.userPrompt } ] } }}",
      "options": { "timeout": 300000 }
    },
    "id": randomUUID(),
    "name": "Agent: Chapter Writer",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [600, 1600],
    "credentials": { "openAiApi": { "id": "lIvnrEKrZKxdIRLJ", "name": "OpenAi account 5" } }
  };

  const n4 = {
    "parameters": {
      "mode": "runOnceForAllItems",
      "jsCode": "let rawContent = $items('Agent: Chapter Writer')[0].json.choices[0].message.content;\nrawContent = rawContent.replace(/```json\\n?|```/g, '').replace(/<think>[\\\\s\\\\S]*?<\\/think>/g, '').trim();\ntry { return [{ json: JSON.parse(rawContent) }]; } catch(e) { throw new Error('Invalid JSON: ' + rawContent); }"
    },
    "id": randomUUID(),
    "name": "Sanitize Chapter JSON",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [800, 1600]
  };

  const n5 = {
    "parameters": {
      "operation": "executeQuery",
      "query": "UPDATE paragraphs p SET content = j.content, status = 'COMPLETED', actual_word_count = array_length(regexp_split_to_array(j.content, '\\\\s+'), 1) FROM jsonb_to_recordset($1::jsonb) AS j(paragraph_number int, content text) WHERE p.chapter_id = $2::uuid AND p.paragraph_number = j.paragraph_number",
      "options": { "queryReplacement": "={{ [JSON.stringify($json.paragraphs || []), $node[\"Webhook Router\"].json.body.chapterId] }}" }
    },
    "id": randomUUID(),
    "name": "Update Chapter Paragraphs Bulk",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2,
    "position": [1000, 1600],
    "credentials": { "postgres": { "id": "0AsoTCNHEls3AaYu", "name": "Postgres account" } }
  };

  const n6 = {
    "parameters": {
      "operation": "executeQuery",
      "query": "UPDATE chapters SET status = 'COMPLETED' WHERE id = $1::uuid",
      "options": { "queryReplacement": "={{ [$node[\"Webhook Router\"].json.body.chapterId] }}" }
    },
    "id": randomUUID(),
    "name": "Mark Chapter Completed",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2,
    "position": [1200, 1600],
    "credentials": { "postgres": { "id": "0AsoTCNHEls3AaYu", "name": "Postgres account" } }
  };

  data.nodes.push(n1, n2, n_prepare, n3, n4, n5, n6);

  data.connections["Get Book Context Chapter Writer"] = { main: [ [ { node: "Get Chapter Paragraphs", type: "main", index: 0 } ] ] };
  data.connections["Get Chapter Paragraphs"] = { main: [ [ { node: "Prepare Writer Payload", type: "main", index: 0 } ] ] };
  data.connections["Prepare Writer Payload"] = { main: [ [ { node: "Agent: Chapter Writer", type: "main", index: 0 } ] ] };
  data.connections["Agent: Chapter Writer"] = { main: [ [ { node: "Sanitize Chapter JSON", type: "main", index: 0 } ] ] };
  data.connections["Sanitize Chapter JSON"] = { main: [ [ { node: "Update Chapter Paragraphs Bulk", type: "main", index: 0 } ] ] };
  data.connections["Update Chapter Paragraphs Bulk"] = { main: [ [ { node: "Mark Chapter Completed", type: "main", index: 0 } ] ] };

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log('Successfully patched n8n workflow - Literal Object pattern');
} catch (e) {
  console.error(e);
}
