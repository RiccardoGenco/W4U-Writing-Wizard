import fs from 'fs';
const content = fs.readFileSync('src/pages/wizard/ExportPage.tsx', 'utf8');
const regex = /[^\x00-\x7F]/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Found non-ASCII: ${match[0]} at index ${match.index}`);
}
if (!content.match(regex)) console.log('All ASCII');
