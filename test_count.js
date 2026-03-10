
// Test Script: Word Counting Logic Verification
function countWords(text) {
    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF]/g;
    const cleanContent = text.replace(emojiRegex, '').replace(/```markdown\n?|```/g, '').trim();
    return cleanContent.split(/\s+/).filter(w => w.length > 0).length;
}

const testText = "Questo è un test per verificare il conteggio delle parole. 🇮🇹";
const count = countWords(testText);

console.log(`Text: "${testText}"`);
console.log(`Word Count: ${count}`);

if (count === 11) {
    console.log("✅ TEST PASSED: Word counting is accurate.");
} else {
    console.log(`❌ TEST FAILED: Expected 11, got ${count}`);
}
