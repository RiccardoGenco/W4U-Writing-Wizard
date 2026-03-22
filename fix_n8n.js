const fs = require('fs');
const file = './n8n/workflows/w4u_workflow.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const node = data.nodes.find(n => n.name === 'Prepare Writer Payload');
if (node && node.parameters.jsCode) {
  let js = node.parameters.jsCode;
  
  // Fix the backticks on line 38
  js = js.replace(/\\`TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE \\(\\\$\\{webhook\\.partNumber \\|\\| 1\\}\\/\\\$\\{webhook\\.totalParts \\|\\| 1\\}\\):\\,\\n/g, '');
  js = js.replace(/\\\`TRACCIA/g, '`TRACCIA');
  js = js.replace(/\\\$\\{/g, '${');
  js = js.replace(/\\|\\|/g, '||');
  js = js.replace(/\\}/g, '}');
  js = js.replace(/\\//g, '/');
  js = js.replace(/\\,/g, '`,');

  // Let's just do a direct string replace if possible
  const badString = "\\`TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE (${webhook.partNumber || 1}/${webhook.totalParts || 1}):\\,";
  const goodString = "`TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE (${webhook.partNumber || 1}/${webhook.totalParts || 1}):`,";
  
  js = js.replace(badString, goodString);
  
  node.parameters.jsCode = js;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log('Fixed');
}
