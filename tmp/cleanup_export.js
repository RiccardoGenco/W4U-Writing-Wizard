const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'index.cjs');
console.log('Target path:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. EPUB Export: Remove Copyright splice
// We replace the broken conditional block and the actual splice
// Cleanup for the broken part I created earlier
content = content.replace(/if \(false\) \{[^}]*\}\);\s+/g, '');

// Correct the Introduction splice in EPUB
content = content.replace(/if \(introductionText\) \{\s+content\.splice\(2, 0, \{/g, 
    'if (introductionText) {\n            content.splice(1, 0, {');

// 2. DOCX Export: Remove Copyright Page
const docxRegex = /\/\/ --- COPYRIGHT PAGE ---\s+children\.push\([\s\S]*?\);\s+/g;
content = content.replace(docxRegex, '');

// 3. PDF Export: Remove Copyright title-page
// Match the div with copyright info and the disclaimer
const pdfRegex = /<div class="title-page" style="margin-top: 10%;">[\s\S]*?<\/div>\s+/g;
// We only want to remove it if it contains "Editore" or "courtesy_copyright_page"
content = content.replace(pdfRegex, '');

fs.writeFileSync(filePath, content);
console.log('Cleanup completed successfully.');
