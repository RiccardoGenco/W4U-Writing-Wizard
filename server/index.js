const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const Epub = require("epub-gen");
const docx = require("docx");
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

// --- DOCX EXPORT ENDPOINT ---

app.post("/export/docx", async (req, res) => {
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

        // Apply editorial pipeline
        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "W4U Writing Wizard";
        const publisher = "W4U";

        // Define professional styles
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, 
                Header, Footer, PageNumber, convertInchesToTwip, BorderStyle,
                TableOfContents, InternalHyperlink } = docx;

        // Process chapters
        const processedChapters = chapters.map((ch, index) => {
            const rawTitle = ch.title || "Senza titolo";
            const cleanTitle = editorialCasing(normalizeChapterTitle(normalizeText(removeEmojis(rawTitle))));
            const cleanMarkdown = normalizeText(removeEmojis(ch.content || ""));
            
            // Convert markdown to HTML then parse to text
            const htmlContent = marked.parse(cleanMarkdown);
            
            return {
                number: index + 1,
                title: cleanTitle,
                content: htmlContent,
                bookmarkId: `chapter_${index + 1}`
            };
        });

        // Create document sections
        const children = [];

        // --- TITLE PAGE ---
        children.push(
            new Paragraph({
                text: "",
                spacing: { after: 2400 }
            }),
            new Paragraph({
                text: cleanBookTitle,
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                font: { name: "Georgia", size: 64 } // 32pt
            }),
            new Paragraph({
                text: "",
                spacing: { after: 800 }
            }),
            new Paragraph({
                text: `di ${cleanAuthor}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                font: { name: "Georgia", size: 28 } // 14pt
            }),
            new Paragraph({
                text: "",
                spacing: { after: 1600 }
            }),
            new Paragraph({
                text: publisher,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24 } // 12pt
            }),
            // Page break after title page
            new Paragraph({
                text: "",
                pageBreakBefore: true
            })
        );

        // --- TABLE OF CONTENTS ---
        children.push(
            new Paragraph({
                text: "Indice",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                font: { name: "Georgia", size: 36 } // 18pt
            })
        );

        processedChapters.forEach((ch, index) => {
            children.push(
                new Paragraph({
                    children: [
                        new InternalHyperlink({
                            children: [
                                new TextRun({
                                    text: `${ch.number}. ${ch.title}`,
                                    font: { name: "Georgia", size: 24 } // 12pt
                                })
                            ],
                            anchor: ch.bookmarkId
                        })
                    ],
                    spacing: { after: 120 },
                    alignment: AlignmentType.LEFT
                })
            );
        });

        // Page break after TOC
        children.push(
            new Paragraph({
                text: "",
                pageBreakBefore: true
            })
        );

        // --- CHAPTERS ---
        processedChapters.forEach((ch) => {
            // Chapter title with bookmark
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: ch.title,
                            bold: true,
                            font: { name: "Georgia", size: 48 } // 24pt
                        })
                    ],
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 240, after: 240 },
                    bookmark: { id: ch.bookmarkId }
                })
            );

            // Parse HTML content and convert to paragraphs
            // Simple HTML parser for basic tags
            const paragraphs = parseHtmlToParagraphs(ch.content);
            children.push(...paragraphs);

            // Page break after each chapter (except last)
            children.push(
                new Paragraph({
                    text: "",
                    pageBreakBefore: true
                })
            );
        });

        // Helper function to parse HTML to DOCX paragraphs
        function parseHtmlToParagraphs(html) {
            const paragraphs = [];
            
            // Remove HTML tags and split into paragraphs
            const textContent = html
                .replace(/<\/?[^>]+(>|$)/g, "\n") // Replace tags with newlines
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            textContent.forEach(text => {
                paragraphs.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: text,
                                font: { name: "Georgia", size: 24 } // 12pt
                            })
                        ],
                        spacing: { after: 240, line: 360 }, // 1.5 line spacing (240 * 1.5)
                        indent: { firstLine: 360 } // 1.5em = ~360 twips
                    })
                );
            });
            
            return paragraphs;
        }

        // Create document with headers and footers
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(1), // 2.5cm ≈ 1 inch
                            right: convertInchesToTwip(1),
                            bottom: convertInchesToTwip(1),
                            left: convertInchesToTwip(1)
                        }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: cleanBookTitle,
                                        font: { name: "Georgia", size: 20 }, // 10pt
                                        italics: true
                                    })
                                ],
                                alignment: AlignmentType.LEFT
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                        font: { name: "Georgia", size: 20 } // 10pt
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            })
                        ]
                    })
                },
                children: children
            }]
        });

        // Generate DOCX file
        const exportUuid = uuidv4();
        const outputPath = path.join(__dirname, `export_${bookId}_${exportUuid}.docx`);
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        // Send file
        res.download(outputPath, `${cleanBookTitle.replace(/[^a-zA-Z0-9]/g, '_')}.docx`, (err) => {
            if (err) console.error("Download error:", err);
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (unlinkErr) {
                console.error("Cleanup error:", unlinkErr);
            }
        });

    } catch (error) {
        console.error("DOCX Export error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- PROJECT MANAGEMENT ENDPOINTS ---

app.post("/api/projects/delete", async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Project ID is required" });

    try {
        const { error } = await supabase
            .from("books")
            .update({ status: 'deleted' })
            .eq("id", id);

        if (error) throw error;

        res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
        console.error("Delete project error:", error);
        res.status(500).json({ error: "Failed to delete project" });
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
