import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// The user screenshot shows "Update Paragraph" is disconnected from "Response Write".
// We need to establish a connection from "Update Paragraph" (main output 0) -> "Response Write" (main input 0)

const sourceNodeName = 'Update Paragraph';
const targetNodeName = 'Response Write';

if (!workflow.connections[sourceNodeName]) {
    workflow.connections[sourceNodeName] = { main: [[]] };
}

// Ensure the connection exists
const targets = workflow.connections[sourceNodeName].main[0];
const alreadyConnected = targets.some(c => c.node === targetNodeName);

if (!alreadyConnected) {
    targets.push({
        node: targetNodeName,
        type: 'main',
        index: 0
    });
    console.log(`Reconnected "${sourceNodeName}" -> "${targetNodeName}"`);
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
} else {
    console.log(`Connection "${sourceNodeName}" -> "${targetNodeName}" already exists in JSON.`);
}
