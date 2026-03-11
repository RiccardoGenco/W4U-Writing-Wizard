import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Lower max_tokens in Agent: Writer
let writerChanged = false;
workflow.nodes.forEach(n => {
    if (n.name === 'Agent: Writer' && n.parameters && n.parameters.jsonBody) {
        if (n.parameters.jsonBody.includes('"max_tokens": 8000')) {
            n.parameters.jsonBody = n.parameters.jsonBody.replace('"max_tokens": 8000', '"max_tokens": 2000');
            writerChanged = true;
        }
    }
});
console.log('Writer node max_tokens lowered:', writerChanged);

// 2. Add Error Trigger and Logger Postgres node
const hasErrorTrigger = workflow.nodes.some(n => n.type === 'n8n-nodes-base.errorTrigger');
if (!hasErrorTrigger) {
    const errorTriggerNode = {
        parameters: {},
        id: '2b4c8d1e-e2c7-4384-a621-e8d7ea712bcd',
        name: 'Catch Workflow Errors',
        type: 'n8n-nodes-base.errorTrigger',
        typeVersion: 1,
        position: [0, 1500]
    };
    
    const dbUpdateNode = {
        parameters: {
            operation: 'executeQuery',
            query: "UPDATE ai_requests SET status = 'failed', error_message = left($1, 2000), updated_at = NOW() WHERE id::text = $2",
            options: {
                queryReplacement: "={{ $json.execution.error.message || 'Unknown' }}, {{ $('Webhook Router').first().json.body?.requestId || $('Init Book (Optional)').first().json.id || 'missing' }}"
            }
        },
        id: '9a8d712f-bcf2-4ec4-9271-4d3bcd0ea4a5',
        name: 'Log Error to AI Requests',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2,
        position: [250, 1500],
        credentials: {
            postgres: {
                id: '0AsoTCNHEls3AaYu', // Fallback
                name: 'Postgres account'
            }
        }
    };
    
    // Match exactly the credentials object from Log Webhook or Log AI Usage
    const sampleDbNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.postgres' && n.credentials && n.credentials.postgres);
    if (sampleDbNode) {
        dbUpdateNode.credentials.postgres.id = sampleDbNode.credentials.postgres.id;
    }
    
    workflow.nodes.push(errorTriggerNode, dbUpdateNode);
    
    // Initialize or append connection
    if (!workflow.connections['Catch Workflow Errors']) {
        workflow.connections['Catch Workflow Errors'] = {
            main: [
                [
                    {
                        node: 'Log Error to AI Requests',
                        type: 'main',
                        index: 0
                    }
                ]
            ]
        };
    }
    
    console.log('Error Trigger & Logger Postgres node added.');
} else {
    console.log('Catch Workflow Errors trigger already existed. Skipping addition.');
}

// 3. Save
fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Workflow patched successfully!');
