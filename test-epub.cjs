const Epub = require("epub-gen");

async function testEpub() {
    try {
        const { marked } = await import("marked");
        console.log("Marked imported successfully.");

        const options = {
            title: "Test Book",
            author: "Test Author",
            publisher: "W4U",
            content: [
                {
                    title: "Chapter 1",
                    data: "<div lang='it'><h1>Chapter 1</h1><p>This is a test chapter.</p></div>"
                }
            ],
            appendChapterTitles: false,
            lang: "it",
            output: "./test-output.epub"
        };

        console.log("Generating dummy EPUB...");
        await new Epub(options).promise;
        console.log("Dummy EPUB generated successfully!");
    } catch (err) {
        console.error("Dummy EPUB Generation Error:", err);
    }
}

testEpub();
