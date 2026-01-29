const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const Epub = require("epub-gen");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Load .env
try {
    const dotenv = require("dotenv");
    dotenv.config({ path: path.join(__dirname, "../.env") });
} catch (e) {
    console.log("Dotenv not found or already loaded");
}

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

// --- EDITORIAL PIPELINE UTILS ---

const removeEmojis = (text) => {
    if (!text) return "";
    return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
};

const normalizeText = (text) => {
    if (!text) return "";
    return text
        .replace(/\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/<hr\s*\/?>/gi, "") // Phase 1: Remove all <hr/>
        .trim();
};

/**
 * Editorial Casing: Transforms ALL CAPS to Sentence case, preserving 2-4 letter acronyms.
 */
const editorialCasing = (text) => {
    if (!text) return "";
    // Check if it's mostly uppercase
    const upperCaseMatches = text.match(/[A-Z]/g) || [];
    const lowerCaseMatches = text.match(/[a-z]/g) || [];

    if (upperCaseMatches.length > lowerCaseMatches.length && upperCaseMatches.length > 4) {
        return text.split(" ").map(word => {
            // Preserve potential acronyms (2-4 letters, all uppercase)
            if (word.length >= 2 && word.length <= 4 && /^[A-Z]+$/.test(word)) {
                return word;
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(" ");
    }
    return text;
};

/**
 * Chapter Hierarchy Normalization: Removes repetitive "Capitolo X:" markers.
 */
const normalizeChapterTitle = (title) => {
    if (!title) return "";
    // Removes common prefixes like "Capitolo 1:", "Chapter 1 -", "1."
    return title.replace(/^(Capitolo|Chapter|Cap|Ch|Parte|Part)\s*\d+[:\s\-\.]*/i, "").trim();
};

// --- EPUB EXPORT ENDPOINT ---

app.post("/export/epub", async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const { marked } = await import("marked");

        // Fetch Book
        const { data: book, error: bookError } = await supabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

        if (bookError || !book) throw new Error("Book not found");

        // Fetch Chapters
        const { data: chapters, error: chaptersError } = await supabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });

        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));

        // Process Content with Production-Grade Logic
        const content = chapters.map((ch) => {
            // 1. Structural Title Cleaning
            const rawTitle = ch.title || "Senza titolo";
            const cleanTitle = editorialCasing(normalizeChapterTitle(normalizeText(removeEmojis(rawTitle))));

            // 2. Content Sanitization
            const cleanMarkdown = normalizeText(removeEmojis(ch.content || ""));
            const semanticHtml = marked.parse(cleanMarkdown);

            return {
                title: cleanTitle,
                // Phase 1: Ensure lang="it" and single <h1>
                data: `<div lang="it"><h1>${cleanTitle}</h1><div>${semanticHtml}</div></div>`,
            };
        });

        const exportUuid = uuidv4();
        const outputPath = path.join(__dirname, `export_${bookId}_${exportUuid}.epub`);

        const options = {
            title: cleanBookTitle,
            author: book.author || "W4U Writing Wizard",
            publisher: "W4U",
            content: content,
            appendChapterTitles: false,
            lang: "it", // Phase 1: Global language enforcement
            uuid: exportUuid, // Phase 3: Stable Identifier
            output: outputPath,
            // Phase 2: Reflowable-First CSS
            css: `
        body { font-family: serif; line-height: 1.5; text-align: justify; }
        h1 { text-align: center; margin-top: 2em; margin-bottom: 1em; font-weight: normal; }
        h2 { font-size: 1.3em; margin-top: 1.5em; }
        p { margin-bottom: 0.8em; text-indent: 0; }
        p + p { text-indent: 1.5em; margin-top: 0; }
        ul, ol { margin-bottom: 1em; }
        li { margin-bottom: 0.4em; }
      `
        };

        // Generate EPUB
        new Epub(options).promise.then(
            async () => {
                res.download(outputPath, `libro_${bookId}.epub`, (err) => {
                    if (err) console.error("Download error:", err);
                    try {
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    } catch (unlinkErr) {
                        console.error("Cleanup error:", unlinkErr);
                    }
                });
            },
            (err) => {
                console.error("EPUB Generation Error:", err);
                res.status(500).json({ error: "Failed to generate EPUB" });
            }
        );
    } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- SHARED SANITIZATION ENDPOINT ---

app.post("/api/sanitize", (req, res) => {
    const { text, method } = req.body;
    let cleanText = text || "";

    try {
        if (method === 'chapter_title') {
            cleanText = editorialCasing(normalizeChapterTitle(normalizeText(removeEmojis(cleanText))));
        } else if (method === 'editorial') {
            cleanText = editorialCasing(normalizeText(removeEmojis(cleanText)));
        } else {
            // Default: basic cleanup
            cleanText = normalizeText(removeEmojis(cleanText));
        }

        res.json({ text: cleanText });
    } catch (error) {
        console.error("Sanitization error:", error);
        res.status(500).json({ error: "Sanitization failed" });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`EPUB Export Server (Professional Edition) running on port ${PORT}`);
});
