const fs = require('fs');
try {
  const data = fs.readFileSync('./n8n/workflows/w4u_workflow.json', 'utf8');
  const workflow = JSON.parse(data);
  const targetNode = workflow.nodes.find(n => n.name === 'Prepare Writer Payload');
  
  if (targetNode) {
    let jsCode = targetNode.parameters.jsCode;
    
    // Check if we already injected the logic
    if (!jsCode.includes('paragraphRange')) {
      // Find the line where we check paragraphs array
      const insertionPoint = `if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
  throw new Error('No scaffold paragraphs found for chapter writer');
}`;

      const newLogic = `
if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
  throw new Error('No scaffold paragraphs found for chapter writer');
}

// FILTER PARAGRAPHS BASED ON RANGE (SPLIT CHAPTER LOGIC)
const range = webhook.paragraphRange;
let targetParagraphs = paragraphs;
if (Array.isArray(range) && range.length === 2) {
  targetParagraphs = paragraphs.filter(p => p.paragraph_number >= range[0] && p.paragraph_number <= range[1]);
  if (targetParagraphs.length === 0) {
     throw new Error(\`No paragraphs found in range \${range[0]}-\${range[1]}\`);
  }
}
`;
      jsCode = jsCode.replace(insertionPoint, newLogic);

      // Now replace the usages of "paragraphs" with "targetParagraphs" for the outline and length
      jsCode = jsCode.replace(/const safeTargetWordCount = .*?;/, `const safeTargetWordCount = Number.isFinite(targetWordCount) && targetWordCount > 0 ? Math.round(targetWordCount) : Math.max(1200, targetParagraphs.length * 250);`);
      jsCode = jsCode.replace(/const outlineStr = paragraphs\.map/, 'const outlineStr = targetParagraphs.map');
      jsCode = jsCode.replace(/expectedParagraphs: paragraphs\.length/, 'expectedParagraphs: targetParagraphs.length');
      
      // Inject part number into the prompt
      jsCode = jsCode.replace(/\'TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN ORDINE:\',/, `\\n  \`TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE (\${webhook.partNumber || 1}/\${webhook.totalParts || 1}):\`,`);

      targetNode.parameters.jsCode = jsCode;
      
      fs.writeFileSync('./n8n/workflows/w4u_workflow.json', JSON.stringify(workflow, null, 2));
      console.log('Successfully updated w4u_workflow.json');
    } else {
      console.log('Already updated');
    }
  } else {
    console.error('Node "Prepare Writer Payload" not found');
  }
} catch (e) {
  console.error(e);
}
