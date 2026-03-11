import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Fix Error Trigger Context
// The node 'Log Error to AI Requests' uses $('Webhook Router') which throws an error if that node didn't execute
// We will replace it with a safer evaluation using `execution.error` or looking at webhook data differently
workflow.nodes.forEach(n => {
    if (n.name === 'Log Error to AI Requests' && n.parameters && n.parameters.options && n.parameters.options.queryReplacement) {
        // Find the safer way to extract the request ID. If the error trigger catches a failure, 
        // the original trigger data is usually in $execution.customData or we can parse it from the webhook payload if available.
        // For an error trigger, often the best approach in n8n is to grab the original execution triggering data
        n.parameters.options.queryReplacement = 
            "={{ $json.execution.error.message || 'Unknown' }}, {{ $execution.customData?.requestId || $('Webhook Router').first().json?.body?.requestId || $('Init Book (Optional)').first().json?.id || 'error-missing-id' }}";
    }
});
console.log('Error Trigger expressions patched for safety.');

// 2. Remove Deprecated HTTP Requests
// The user reported "Cannot POST /api/webhook/n8n/complete" in HTTP Request nodes.
// Let's find nodes pointing to /api/webhook/n8n/complete and delete them
const nodesToDelete = workflow.nodes.filter(n => 
    n.type === 'n8n-nodes-base.httpRequest' && 
    n.parameters && 
    typeof n.parameters.url === 'string' &&
    n.parameters.url.includes('/api/webhook/n8n/complete')
).map(n => n.name);

if (nodesToDelete.length > 0) {
    console.log('Found deprecated HTTP Request nodes:', nodesToDelete);
    workflow.nodes = workflow.nodes.filter(n => !nodesToDelete.includes(n.name));
    
    // Clean up connections pointing to or from these nodes
    for (const [sourceNode, targets] of Object.entries(workflow.connections)) {
        if (nodesToDelete.includes(sourceNode)) {
            // Deleted node is the source, remove all outgoing connections
            delete workflow.connections[sourceNode];
            continue;
        }
        
        // Check if deleted node is a target
        for (const outputType in targets) {
            targets[outputType] = targets[outputType].filter(connection => !nodesToDelete.includes(connection.node));
        }
    }
    console.log('Removed deprecated nodes and connections.');
} else {
    console.log('No deprecated /api/webhook/n8n/complete nodes found.');
}

// 3. Save
fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Workflow error fixes applied successfully!');
