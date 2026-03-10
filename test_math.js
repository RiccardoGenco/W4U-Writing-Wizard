
// Test Script: Target Page Mathematical Model Verification
const targetPages = 50;
const chaptersRate = 10;
const wordsPerPage = 250;

console.log(`--- Test Scenario: ${targetPages} Pages ---`);
const numChapters = Math.max(1, Math.floor(targetPages / chaptersRate));
const totalWordsTarget = targetPages * wordsPerPage;
const wordsPerChapter = Math.floor(totalWordsTarget / numChapters);
const paragraphsPerChapter = Math.max(1, Math.ceil(wordsPerChapter / 250));
const totalParagraphs = paragraphsPerChapter * numChapters;
const finalWords = totalParagraphs * 250;

console.log(`Target Pages: ${targetPages}`);
console.log(`Expected Chapters: ${numChapters}`);
console.log(`Words Per Chapter: ${wordsPerChapter}`);
console.log(`Paragraphs Per Chapter: ${paragraphsPerChapter}`);
console.log(`Total Paragraphs: ${totalParagraphs}`);
console.log(`Final Word Count: ${finalWords}`);
console.log(`Deviation: ${((finalWords - totalWordsTarget) / totalWordsTarget * 100).toFixed(2)}%`);

if (Math.abs(finalWords - totalWordsTarget) / totalWordsTarget < 0.1) {
    console.log("✅ TEST PASSED: Mathematical model is within 10% tolerance.");
} else {
    console.log("❌ TEST FAILED: High deviation detected.");
}
