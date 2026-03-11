import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let patched = false;
workflow.nodes.forEach(n => {
    if (n.name === 'Calculator' && n.parameters && n.parameters.jsCode) {
        // Patch: add bookData.target_pages as high-priority read before context_data lookups
        const oldLine = `const targetPagesRaw = $node["Webhook Router"].json.body.targetPages || config.target_pages || dbContext.target_pages;`;
        const newLine = `const targetPagesRaw = $node["Webhook Router"].json.body.targetPages 
    || bookData.target_pages    // Read from the dedicated DB column (added by migration)
    || dbContext.target_pages   // Legacy: from context_data JSON
    || config.target_pages;     // Legacy: from configuration JSON`;

        if (n.parameters.jsCode.includes(oldLine)) {
            n.parameters.jsCode = n.parameters.jsCode.replace(oldLine, newLine);
            patched = true;
        } else {
            // String might have slight whitespace differences, try regex
            const regex = /const targetPagesRaw = \$node\["Webhook Router"\]\.json\.body\.targetPages \|\| config\.target_pages \|\| dbContext\.target_pages;/;
            if (regex.test(n.parameters.jsCode)) {
                n.parameters.jsCode = n.parameters.jsCode.replace(regex, newLine);
                patched = true;
            }
        }
    }
});

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
console.log(patched ? 'Calculator node patched to read DB column!' : 'WARNING: Could not find the target line to patch.');
