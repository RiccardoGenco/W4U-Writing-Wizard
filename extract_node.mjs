import fs from 'fs';
try {
  const d = JSON.parse(fs.readFileSync('n8n/workflows/w4u_workflow.json', 'utf8'));
  const node = d.nodes.find(n => n.name === 'Agent: Chapter Writer');
  fs.writeFileSync('problem_node.json', JSON.stringify(node, null, 2));
  console.log('Node extracted to problem_node.json');
} catch (e) {
  console.error(e.message);
}
