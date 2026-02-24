const Epub = require("epub-gen-memory").default || require("epub-gen-memory");
const fs = require("fs");

async function testEpubMemory() {
    try {
        const options = {
            title: "Test Book",
            author: "Test Author",
            publisher: "W4U",
            lang: "it",
        };
        const content = [
            {
                title: "Chapter 1",
                content: "<div lang='it'><h1>Chapter 1</h1><p>This is a test chapter.</p></div>"
            }
        ];

        console.log("Generating memory EPUB...");
        // epub-gen-memory usually takes (options, content)
        const buffer = await Epub(options, content);
        fs.writeFileSync("./test-output-memory.epub", buffer);
        console.log("Memory EPUB generated successfully, size:", buffer.length);
    } catch (err) {
        console.error("Memory EPUB Generation Error:", err);
    }
}

testEpubMemory();
