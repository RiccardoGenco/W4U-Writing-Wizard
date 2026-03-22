const fs = require('fs');
try {
  const data = fs.readFileSync('./n8n/workflows/w4u_workflow.json', 'utf8');
  const workflow = JSON.parse(data);
  const writerNode = workflow.nodes.find(n => n.name === 'Agent: Writer');
  console.log(JSON.stringify(writerNode, null, 2));
} catch (e) {
  console.error(e);
}
