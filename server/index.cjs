const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

// const Epub = require("epub-gen");
// const docx = require("docx");
// Puppeteer logic moved to /export/pdf


const path = require("path");

// Load .env
try {
    const dotenv = require("dotenv");
    // Try loading from parent directory (if running from server/) or current (if from root)
    dotenv.config({ path: path.join(__dirname, "../.env") });
} catch (e) {
    console.log("Dotenv not found or already loaded");
}

const app = express();

app.use(cors({
    origin: process.env.VITE_APP_URL || "*", // Allow all or specific origin
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
// app.options removed as per Express 5 best practices with app.use(cors())

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// DEBUG LOGGER
app.use((req, res, next) => {
    console.log(`[DEBUG] Incoming Request: ${req.method} ${req.url}`);
    console.log(`[DEBUG] Headers:`, JSON.stringify(req.headers));
    next();
});

// Start-up Health Check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        environment: process.env.VERCEL ? "vercel" : "local",
        node_version: process.version
    });
});


const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

const n8nWebhookUrlRaw = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL;
const N8N_WEBHOOK_URL = n8nWebhookUrlRaw?.startsWith('/')
    ? `https://auto.mamadev.org${n8nWebhookUrlRaw}`
    : n8nWebhookUrlRaw;

// --- EDITORIAL PIPELINE UTILS ---

const removeEmojis = (text) => {
    if (!text) return "";
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "");
};

const normalizeText = (text) => {
    if (!text) return "";
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

const editorialCasing = (text) => {
    if (!text) return "";
    const minorWords = new Set([
        "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
        "at", "by", "in", "of", "on", "to", "up", "as", "is", "it",
        "di", "del", "della", "dei", "degli", "delle", "da", "dal", "dalla",
        "dai", "dagli", "dalle", "in", "nel", "nella", "nei", "negli", "nelle",
        "su", "sul", "sulla", "sui", "sugli", "sulle", "con", "per", "tra", "fra",
        "e", "o", "ma", "se", "che", "un", "una", "uno", "il", "lo", "la", "i", "gli", "le"
    ]);
    return text
        .toLowerCase()
        .split(" ")
        .map((word, index) => {
            if (index === 0 || !minorWords.has(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
        })
        .join(" ");
};

const cleanChapterTitle = (text) => {
    if (!text) return "";
    return text
        .replace(/^(capitolo|chapter|cap\.?)\s*\d+\s*[:\-–—]?\s*/i, "")
        .replace(/^\d+\.\s*/, "")
        .trim();
};

const formatChapterTitle = (index, rawTitle) => {
    const cleanTitle = editorialCasing(cleanChapterTitle(normalizeText(removeEmojis(rawTitle))));
    return `Capitolo ${index + 1} – ${cleanTitle}`;
};

// --- HELPER: Get Temp Path ---
const getTempPath = (filename) => {
    if (process.env.VERCEL) {
        return path.join("/tmp", filename);
    }
    return path.join(__dirname, filename);
};

// --- HELPER: Template Rendering ---
const renderTemplate = (template, data) => {
    if (!template) return "";
    let rendered = template;
    for (const key in data) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(regex, data[key]);
    }
    return rendered;
};


// --- EPUB EXPORT ENDPOINT ---

app.post("/export/epub", async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const Epub = require("epub-gen-memory").default || require("epub-gen-memory"); // Lazy load

        const { marked } = await import("marked");

        // Extract and validate Auth Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }
        const token = authHeader.split('Bearer ')[1];

        // Create Scoped Client
        const scopedSupabase = createClient(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
            process.env.VITE_SUPABASE_ANON_KEY || "",
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Fetch User (Verify Token Validity)
        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: "Invalid token or user not found" });

        // Fetch Book using Scoped Client (Respects RLS)
        const { data: book, error: bookError } = await scopedSupabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

        if (bookError || !book) throw new Error("Book not found or access denied");

        // Fetch Chapters using Scoped Client
        const { data: chapters, error: chaptersError } = await scopedSupabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });

        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const { data: paragraphs, error: paragraphsError } = await scopedSupabase
            .from("paragraphs")
            .select("*")
            .in("chapter_id", chapters.map(c => c.id))
            .order("paragraph_number", { ascending: true });

        if (paragraphsError) throw new Error("Paragraphs not found");

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "Autore";

        // Fetch Courtesy Templates
        const { data: promptData } = await scopedSupabase
            .from("system_prompts")
            .select("*")
            .filter('key', 'ilike', 'courtesy_%');

        const prompts = (promptData || []).reduce((acc, curr) => ({ ...acc, [curr.key]: curr.prompt_text }), {});
        const epubDisclaimer = prompts['courtesy_disclaimer'] || "Tutti i diritti sono riservati...";
        const epubDesc = book.plot_summary ? (book.plot_summary.substring(0, 300) + "...") : "Un libro scritto con W4U";

        const templateData = {
            title: cleanBookTitle,
            author: cleanAuthor,
            description: epubDesc,
            description_short: epubDesc.substring(0, 50),
            disclaimer: epubDisclaimer
        };

        // Process Content with Production-Grade Logic
        const content = chapters.map((ch, index) => {
            const fullTitle = formatChapterTitle(index, ch.title || "Senza titolo");

            // Compile paragraphs for this chapter
            const chParagraphs = paragraphs.filter(p => p.chapter_id === ch.id);
            
            // Build semantic HTML content
            let chapterHtml = `<div lang="it"><h1>${fullTitle}</h1>`;
            
            // 1. Add Chapter Intro if exists
            if (ch.content && ch.content.trim() !== "") {
                chapterHtml += `<div class="chapter-intro">${marked.parse(normalizeText(removeEmojis(ch.content)))}</div>`;
            }

            // 2. Add Subchapters (Paragraphs)
            chParagraphs.forEach(p => {
                const subTitle = p.title ? `<h2>${editorialCasing(normalizeText(removeEmojis(p.title)))}</h2>` : "";
                const subContent = p.content ? marked.parse(normalizeText(removeEmojis(p.content))) : "";
                chapterHtml += `<section class="subchapter">${subTitle}${subContent}</section>`;
            });

            chapterHtml += `</div>`;

            return {
                title: fullTitle,
                content: chapterHtml,
            };
        });

        // Titolo
        content.unshift({
            title: "Titolo",
            content: renderTemplate(prompts['courtesy_title_page'], templateData) || `<div lang="it" style="text-align: center; margin-top: 30%;">
                     <h2>${cleanAuthor}</h2>
                     <h1 style="font-size: 2.5em; margin: 0.5em 0;">${cleanBookTitle}</h1>
                     <p><em>${epubDesc}</em></p>
                   </div>`
        });

        // Copyright
        content.splice(1, 0, {
            title: "Copyright",
            content: renderTemplate(prompts['courtesy_copyright_page'], templateData) || `<div lang="it" style="text-align: center; margin-top: 10%;">
                     <h2>${cleanBookTitle}</h2>
                     <p>${cleanBookTitle} - ${epubDesc.substring(0, 50)}...</p>
                     <h3>${cleanAuthor}</h3>
                     <br/><br/>
                     <p><strong>Editore:</strong><br/>Write4You<br/>mail@write4you.com</p>
                     <br/><br/>
                     <p style="text-align: justify; font-size: 0.9em;">${epubDisclaimer}</p>
                   </div>`
        });

        const options = {
            title: cleanBookTitle,
            author: cleanAuthor,
            publisher: "W4U",
            appendChapterTitles: false,
            lang: "it",
            css: `
        body { font-family: serif; line-height: 1.5; text-align: justify; }
        h1 { text-align: center; margin-top: 2em; margin-bottom: 1em; font-weight: bold; font-size: 1.5em; page-break-before: always; }
        h2 { font-size: 1.3em; margin-top: 1.5em; }
        p { margin-bottom: 0.8em; text-indent: 0; }
        p + p { text-indent: 1.5em; margin-top: 0; }
        ul, ol { margin-bottom: 1em; }
        li { margin-bottom: 0.4em; }
      `
        };

        // Generate EPUB
        try {
            const buffer = await Epub(options, content);
            res.setHeader('Content-Disposition', `attachment; filename="libro_${bookId}.epub"`);
            res.setHeader('Content-Type', 'application/epub+zip');
            res.send(buffer);
        } catch (err) {
            console.error("EPUB Generation Error:", err);
            res.status(500).json({ error: "Failed to generate EPUB" });
        }
    } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- MANUSCRIPT ENDPOINTS ---

/**
 * Handle Manuscript Content Upload (Indexing for RAG)
 */
app.post('/api/upload-draft', async (req, res) => {
    try {
        const { bookId, textContent } = req.body;

        if (!bookId || !textContent) {
            return res.status(400).json({ error: 'Missing bookId or textContent' });
        }

        console.log(`[Backend] Indexing draft for book ${bookId} (${textContent.length} chars)`);

        const n8nHeaders = {
            'Content-Type': 'application/json',
        };

        const n8nApiKey = process.env.N8N_API_KEY || process.env.VITE_N8N_API_KEY;
        if (n8nApiKey) {
            n8nHeaders['X-API-Key'] = n8nApiKey;
        }
        if (process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET) {
            n8nHeaders['X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
        }

        // Forward to N8N for chunking and embedding
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: n8nHeaders,
            body: JSON.stringify({
                action: 'INDEX_DRAFT',
                bookId,
                textContent
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`N8N Error: ${errorText}`);
        }

        const result = await response.json();
        res.json(result);

    } catch (error) {
        console.error('[Backend] Upload Draft Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- DOCX EXPORT ENDPOINT ---

app.post("/export/docx", async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const docx = require("docx"); // Lazy load

        const { marked } = await import("marked");

        // Extract and validate Auth Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }
        const token = authHeader.split('Bearer ')[1];

        // Create Scoped Client
        const scopedSupabase = createClient(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
            process.env.VITE_SUPABASE_ANON_KEY || "",
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Fetch User (Verify Token Validity)
        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: "Invalid token or user not found" });

        // Fetch Book using Scoped Client
        const { data: book, error: bookError } = await scopedSupabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

        if (bookError || !book) throw new Error("Book not found or access denied");

        const { data: chapters, error: chaptersError } = await scopedSupabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });

        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const { data: paragraphs, error: paragraphsError } = await scopedSupabase
            .from("paragraphs")
            .select("*")
            .in("chapter_id", chapters.map(c => c.id))
            .order("paragraph_number", { ascending: true });

        if (paragraphsError) throw new Error("Paragraphs not found");


        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "W4U Writing Wizard";
        const publisher = "W4U";

        // Fetch Courtesy Templates
        const { data: promptData } = await scopedSupabase
            .from("system_prompts")
            .select("*")
            .filter('key', 'ilike', 'courtesy_%');

        const prompts = (promptData || []).reduce((acc, curr) => ({ ...acc, [curr.key]: curr.prompt_text }), {});
        const docxDisclaimer = prompts['courtesy_disclaimer'] || "Tutti i diritti sono riservati...";
        const docxDesc = book.plot_summary ? (book.plot_summary.substring(0, 300) + "...") : "Un libro scritto con W4U";

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            Header, Footer, PageNumber, convertInchesToTwip,
            InternalHyperlink } = docx;

        const processedChapters = chapters.map((ch, index) => {
            const rawTitle = ch.title || "Senza titolo";
            const fullTitle = formatChapterTitle(index, rawTitle);

            // Fetch chapter introduction
            const introHtml = ch.content ? marked.parse(normalizeText(removeEmojis(ch.content))) : "";

            // Compile paragraphs for this chapter
            const chParagraphs = paragraphs.filter(p => p.chapter_id === ch.id);
            
            const subchapters = chParagraphs.map(p => ({
                title: p.title ? editorialCasing(normalizeText(removeEmojis(p.title))) : "",
                htmlContent: p.content ? marked.parse(normalizeText(removeEmojis(p.content))) : ""
            }));

            return {
                number: index + 1,
                title: fullTitle,
                introHtml: introHtml,
                subchapters: subchapters,
                bookmarkId: `chapter_${index + 1}`
            };
        });

        const children = [];

        // --- CONSTANTS ---

        // --- TITLE PAGE ---
        children.push(
            new Paragraph({ text: "", spacing: { after: 2400 } }),
            new Paragraph({
                text: cleanBookTitle,
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                font: { name: "Georgia", size: 64 }
            }),
            new Paragraph({ text: "", spacing: { after: 800 } }),
            new Paragraph({
                text: `di ${cleanAuthor}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                font: { name: "Georgia", size: 28 }
            }),
            new Paragraph({ text: "", spacing: { after: 1600 } }),
            new Paragraph({
                text: docxDesc,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 20 },
                italics: true
            }),
            new Paragraph({ text: "", pageBreakBefore: true }) // End of Title Page
        );

        // --- COPYRIGHT PAGE ---
        children.push(
            new Paragraph({ text: "", spacing: { after: 1200 } }),
            new Paragraph({
                text: cleanBookTitle,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 36, bold: true },
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: `${cleanBookTitle} - ${docxDesc.substring(0, 50)}...`,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24 },
                spacing: { after: 400 }
            }),
            new Paragraph({
                text: cleanAuthor,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 32 },
                spacing: { after: 1200 }
            }),
            new Paragraph({
                text: "Editore:",
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24, bold: true }
            }),
            new Paragraph({
                text: publisher,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24 }
            }),
            new Paragraph({
                text: "mail@write4you.com",
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24 },
                spacing: { after: 1200 }
            }),
            new Paragraph({
                text: docxDisclaimer,
                alignment: AlignmentType.BOTH,
                font: { name: "Georgia", size: 20 },
                spacing: { line: 360 }
            }),
            new Paragraph({ text: "", pageBreakBefore: true }) // End of Copyright Page
        );

        // --- TABLE OF CONTENTS ---
        children.push(
            new Paragraph({
                text: "Indice",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                font: { name: "Georgia", size: 36 }
            })
        );

        processedChapters.forEach((ch) => {
            children.push(
                new Paragraph({
                    children: [
                        new InternalHyperlink({
                            children: [
                                new TextRun({
                                    text: ch.title,
                                    font: { name: "Georgia", size: 24 }
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

        children.push(new Paragraph({ text: "", pageBreakBefore: true }));

        // --- CHAPTERS ---
        processedChapters.forEach((ch) => {
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: ch.title,
                            bold: true,
                            font: { name: "Georgia", size: 48 }
                        })
                    ],
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 400, after: 400 },
                    bookmark: { id: ch.bookmarkId }
                })
            );

            // 1. Chapter Introduction
            if (ch.introHtml) {
                parseHtmlToParagraphs(ch.introHtml).forEach(p => children.push(p));
            }

            // 2. Subchapters
            ch.subchapters.forEach(sub => {
                if (sub.title) {
                    children.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: sub.title,
                                    bold: true,
                                    font: { name: "Georgia", size: 32 }
                                })
                            ],
                            heading: HeadingLevel.HEADING_2,
                            spacing: { before: 300, after: 200 }
                        })
                    );
                }
                
                if (sub.htmlContent) {
                    parseHtmlToParagraphs(sub.htmlContent).forEach(p => children.push(p));
                }
            });

            children.push(new Paragraph({ text: "", pageBreakBefore: true }));
        });

        function parseHtmlToParagraphs(html) {
            const paragraphs = [];
            const textContent = html
                .replace(/<\/?[^>]+(\>|$)/g, "\n")
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
                                font: { name: "Georgia", size: 24 }
                            })
                        ],
                        spacing: { after: 240, line: 360 },
                        indent: { firstLine: 360 }
                    })
                );
            });
            return paragraphs;
        }

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(1),
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
                                        text: `${cleanAuthor} - ${cleanBookTitle}`,
                                        font: { name: "Georgia", size: 20 },
                                        italics: true
                                    })
                                ],
                                alignment: AlignmentType.CENTER
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
                                        font: { name: "Georgia", size: 20 }
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

        const exportUuid = uuidv4();
        const outputPath = getTempPath(`export_${bookId}_${exportUuid}.docx`);

        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        res.download(outputPath, `${cleanBookTitle.replace(/[^a-zA-Z0-9]/g, '_')}.docx`, (err) => {
            if (err) console.error("Download error:", err);
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (unlinkErr) { console.error("Cleanup error:", unlinkErr); }
        });

    } catch (error) {
        console.error("DOCX Export error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- PDF EXPORT ENDPOINT ---
app.post("/export/pdf", async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        // Lazy load Puppeteer
        let puppeteer;
        let chromium;

        if (process.env.VERCEL) {
            try {
                puppeteer = require("puppeteer-core");
                chromium = require("@sparticuz/chromium");
            } catch (e) {
                throw new Error("Vercel puppeteer dependencies missing: " + e.message);
            }
        } else {
            try {
                puppeteer = require("puppeteer");
            } catch (e) {
                console.warn("Local puppeteer loading warning:", e.message);
                // Try to proceed, maybe it's installed
                puppeteer = require("puppeteer");
            }
        }


        // Extract and validate Auth Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }
        const token = authHeader.split('Bearer ')[1];

        // Create Scoped Client
        const scopedSupabase = createClient(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
            process.env.VITE_SUPABASE_ANON_KEY || "",
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Fetch User (Verify Token Validity)
        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: "Invalid token or user not found" });

        const { data: book, error: bookError } = await scopedSupabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();
        if (bookError || !book) throw new Error("Book not found or access denied");

        const { data: chapters, error: chaptersError } = await scopedSupabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });
        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const { data: paragraphs, error: paragraphsError } = await scopedSupabase
            .from("paragraphs")
            .select("*")
            .in("chapter_id", chapters.map(c => c.id))
            .order("paragraph_number", { ascending: true });

        if (paragraphsError) throw new Error("Paragraphs not found");

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "Autore";

        // Fetch Courtesy Templates
        const { data: promptData } = await scopedSupabase
            .from("system_prompts")
            .select("*")
            .filter('key', 'ilike', 'courtesy_%');

        const prompts = (promptData || []).reduce((acc, curr) => ({ ...acc, [curr.key]: curr.prompt_text }), {});
        const pdfDisclaimer = prompts['courtesy_disclaimer'] || "Tutti i diritti sono riservati...";
        const pdfDesc = book.plot_summary ? (book.plot_summary.substring(0, 300) + "...") : "Un libro scritto con W4U";

        const templateData = {
            title: cleanBookTitle,
            author: cleanAuthor,
            description: pdfDesc,
            description_short: pdfDesc.substring(0, 50),
            disclaimer: pdfDisclaimer
        };

        // Build HTML for PDF
        let htmlContent = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <style>
                @page {
                    margin: 2.5cm;
                    size: A4;
                }
                body { font-family: 'Georgia', serif; line-height: 1.8; color: #1a1a1a; }
                .title-page { text-align: center; margin-top: 35%; page-break-after: always; }
                h1.book-title { font-size: 3.5em; margin-bottom: 0.2em; color: #000; }
                h2.author { font-size: 1.6em; font-weight: normal; color: #444; margin-bottom: 3em; }
                
                .toc { page-break-after: always; padding: 1em 0; }
                .toc h1 { text-align: center; font-size: 2.2em; margin-bottom: 1.5em; }
                .toc-item { margin: 0.8em 0; font-size: 1.1em; }
                .toc-item a { text-decoration: none; color: #333; border-bottom: 1px dotted #aaa; display: flex; justify-content: space-between; }
                
                .chapter { page-break-before: always; padding-top: 1em; }
                .chapter-title { text-align: center; font-size: 2.4em; margin-top: 2em; margin-bottom: 2em; font-weight: bold; border-bottom: 2px solid #eee; padding-bottom: 1em; }
                
                .chapter-intro { font-style: italic; color: #555; margin-bottom: 3em; font-size: 1.1em; line-height: 1.6; padding: 0 1em; border-left: 3px solid #eee; }
                
                .subchapter { margin-bottom: 3em; }
                .subchapter h2 { font-size: 1.6em; margin-top: 2em; margin-bottom: 1em; color: #222; border-left: 4px solid #fecaca; padding-left: 15px; }
                
                .content p { text-indent: 1.5em; margin-bottom: 1em; text-align: justify; widows: 3; orphans: 3; }
                .content p:first-of-type { text-indent: 0; }
                .content h3 { font-size: 1.3em; margin-top: 1.5em; }
            </style>
        </head>
        <body>
            <div class="title-page">
                ${renderTemplate(prompts['courtesy_title_page'], templateData) || `
                <h1 class="book-title">${cleanBookTitle}</h1>
                <h2 class="author">di ${cleanAuthor}</h2>
                <p style="margin-top: 2em; font-style: italic; font-size: 1.2em;">${pdfDesc}</p>
                `}
            </div>
            <div class="title-page" style="margin-top: 10%;">
                ${renderTemplate(prompts['courtesy_copyright_page'], templateData) || `
                <h2 style="font-size: 2em; margin-bottom: 0.5em; font-weight: normal;">${cleanBookTitle}</h2>
                <p style="font-size: 1.2em;">${cleanBookTitle} - ${pdfDesc.substring(0, 50)}...</p>
                <h3 style="margin-top: 1em; font-size: 1.5em; font-weight: normal;">${cleanAuthor}</h3>
                <div style="margin-top: 4em;">
                    <p><strong>Editore:</strong><br/>Write4You<br/>mail@write4you.com</p>
                </div>
                <div style="margin-top: 5em; text-align: justify; font-size: 0.9em; line-height: 1.8; padding: 0 3em;">
                    <p>${pdfDisclaimer}</p>
                </div>
                `}
            </div>

            <div class="toc">
                <h1>Indice</h1>
                ${chapters.map((ch, i) => `
                    <div class="toc-item">
                        <a href="#ch${i + 1}">${formatChapterTitle(i, ch.title || "Senza titolo")}</a>
                    </div>
                `).join('')}
            </div>
            
            ${chapters.map((ch, i) => {
                const fullTitle = formatChapterTitle(i, ch.title || "Senza titolo");
                
                // Compile paragraphs for this chapter
                const chParagraphs = paragraphs.filter(p => p.chapter_id === ch.id);
                
                let chapterHtml = `
                <div class="chapter" id="ch${i + 1}">
                    <h1 class="chapter-title">${fullTitle}</h1>
                    <div class="content">`;
                
                // 1. Intro
                if (ch.content) {
                    chapterHtml += `<div class="chapter-intro">${marked.parse(normalizeText(removeEmojis(ch.content)))}</div>`;
                }

                // 2. Subchapters
                chParagraphs.forEach(p => {
                    const subTitle = p.title ? `<h2>${editorialCasing(normalizeText(removeEmojis(p.title)))}</h2>` : "";
                    const subContent = p.content ? marked.parse(normalizeText(removeEmojis(p.content))) : "";
                    chapterHtml += `<div class="subchapter">${subTitle}${subContent}</div>`;
                });

                chapterHtml += `
                    </div>
                </div>`;
                
                return chapterHtml;
            }).join('')}
        </body>
        </html>
        `;

        let browser;
        if (process.env.VERCEL) {
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        } else {
            browser = await puppeteer.launch({ headless: 'new' });
        }

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const exportUuid = uuidv4();
        const outputPath = getTempPath(`export_${bookId}_${exportUuid}.pdf`);

        await page.pdf({
            path: outputPath,
            format: 'A4',
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size: 10px; text-align: center; width: 100%; color: #888; letter-spacing: 1px;">
                    ${cleanAuthor} &mdash; ${cleanBookTitle}
                </div>`,
            footerTemplate: `
                <div style="font-size: 10px; text-align: center; width: 100%; color: #888;">
                    <span class="pageNumber"></span>
                </div>`,
            margin: { top: '3cm', bottom: '3cm', right: '2cm', left: '2cm' },
            printBackground: true
        });

        await browser.close();

        res.download(outputPath, `libro_${bookId}.pdf`, (err) => {
            if (err) console.error("Download error:", err);
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (unlinkErr) { console.error("Cleanup error:", unlinkErr); }
        });

    } catch (error) {
        console.error("PDF Export error:", error);
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
        res.status(500).json({ error: "Failed to delete project" });
    }
});

// --- AUTH HELPERS ---

app.post("/api/auth/verify-invite", (req, res) => {
    const { code } = req.body;
    // Prefer INVITE_CODE (server secret), fall back to VITE_INVITE_CODE for backward compatibility/dev
    const validCode = process.env.INVITE_CODE || process.env.VITE_INVITE_CODE;

    if (!validCode) {
        // If no code is configured on server, assume open registration or fail secure?
        // Usually if feature is enabled in Client, server must have it.
        // If server has no code, deny to be safe if client sent one.
        console.warn("[Auth] Verify Invite: No INVITE_CODE configured on server.");
        return res.status(500).json({ error: "Server misconfiguration" });
    }

    if (!code || code !== validCode) {
        return res.status(401).json({ error: "Codice invito non valido" });
    }

    return res.json({ success: true });
});

// --- AI AGENT PROXY (ASYNC WITH POLLING) ---

/**
 * Async helper to forward requests to n8n in the background.
 * Updates ai_requests table with results when complete.
 */
async function forwardToN8n(requestId, userId, payload, token) {
    try {
        // Create client: usage scoped if token provided, otherwise global (which is anon - likely to fail if RLS blocks update)
        // If we don't have service_role, we MUST use the user token and have RLS "Users can update own"
        let dbClient = supabase;
        if (token) {
            dbClient = createClient(
                process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
                process.env.VITE_SUPABASE_ANON_KEY || "",
                {
                    global: {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            );
        }

        const n8nWebhookUrl = N8N_WEBHOOK_URL;

        if (!n8nWebhookUrl) {
            throw new Error("N8N_WEBHOOK_URL not configured");
        }

        const n8nPayload = { ...payload, userId, requestId };

        const n8nHeaders = {
            'Content-Type': 'application/json',
        };

        const n8nApiKey = process.env.N8N_API_KEY || process.env.VITE_N8N_API_KEY;
        if (n8nApiKey) {
            n8nHeaders['X-API-Key'] = n8nApiKey;
        }
        if (process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET) {
            n8nHeaders['X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
        }

        // Update status to processing using the service role client to bypass RLS
        const { error: processingError } = await supabase.from('ai_requests')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', requestId);
        
        if (processingError) {
            console.error(`[AI Proxy] Failed to update request ${requestId} to processing:`, processingError.message);
        }

        console.log(`[AI Proxy] Forwarding request ${requestId} to n8n: ${n8nWebhookUrl}`);

        const n8nResponse = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: n8nHeaders,
            body: JSON.stringify(n8nPayload)
        });

        const contentType = n8nResponse.headers.get('content-type') || '';
        let responseData = null;

        const arrayBuffer = await n8nResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const responseText = buffer.toString('utf-8');
        
        console.log(`[AI Proxy Debug] n8n Response Content-Type: ${contentType}`);
        console.log(`[AI Proxy Debug] n8n Response Content length: ${buffer.length}`);

        if (contentType.includes('application/json')) {
            try {
                responseData = JSON.parse(responseText);

                // Handle immediate response from n8n for async tasks
                if (responseData && (responseData.status === 'started' || responseData.status === 'processing')) {
                    console.log(`[AI Proxy] Request ${requestId} started/processing in n8n (async mode). Proxy exiting.`);
                    return; // Exit without marking as completed, n8n will do it.
                }

                // Check if n8n returned a JSON with a base64 string (some n8n setups do this)
                // e.g., [{"data": "base64..."}] or {"data": "base64..."}
                let base64Match = null;
                if (Array.isArray(responseData) && responseData[0]?.data && typeof responseData[0].data === 'string' && responseData[0].data.length > 500) {
                    base64Match = responseData[0].data;
                } else if (responseData?.data && typeof responseData.data === 'string' && responseData.data.length > 500) {
                    base64Match = responseData.data;
                }

                if (base64Match && payload.action === 'GENERATE_COVER') {
                    // Upload base64 to Supabase using service role (supabase client)
                    const imageBuffer = Buffer.from(base64Match, 'base64');
                    const fileName = `${payload.bookId}_cover_${Date.now()}.png`;
                    const { error: uploadError } = await supabase.storage.from('covers').upload(fileName, imageBuffer, { contentType: 'image/png', upsert: true });
                    if (!uploadError) {
                        const { data: publicUrlData } = supabase.storage.from('covers').getPublicUrl(fileName);
                        responseData = { cover_url: publicUrlData.publicUrl };
                    } else {
                        console.error("[AI Proxy] Base64 upload failed:", uploadError.message);
                        throw new Error("Base64 cover upload failed: " + uploadError.message);
                    }
                }
            } catch (e) {
                responseData = { text: responseText };
            }
        } else if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
            // It's binary data (we already have the buffer)
            if (payload.action === 'GENERATE_COVER') {
                const fileName = `${payload.bookId}_cover_${Date.now()}.png`;
                const { error: uploadError } = await supabase.storage.from('covers').upload(fileName, buffer, { contentType: contentType || 'image/png', upsert: true });
                if (uploadError) throw new Error("Failed to upload binary cover image: " + uploadError.message);

                const { data: publicUrlData } = supabase.storage.from('covers').getPublicUrl(fileName);
                responseData = { cover_url: publicUrlData.publicUrl };
            } else {
                responseData = { message: "Received binary data." };
            }
        } else {
            // Might be raw base64 text or plain text
            if (payload.action === 'GENERATE_COVER' && responseText.length > 500 && !responseText.includes(' ')) {
                // Assume it's raw base64
                const imageBuffer = Buffer.from(responseText, 'base64');
                const fileName = `${payload.bookId}_cover_${Date.now()}.png`;
                const { error: uploadError } = await supabase.storage.from('covers').upload(fileName, imageBuffer, { contentType: 'image/png', upsert: true });
                if (uploadError) throw new Error("Failed to upload base64 string cover image: " + uploadError.message);

                const { data: publicUrlData } = supabase.storage.from('covers').getPublicUrl(fileName);
                responseData = { cover_url: publicUrlData.publicUrl };
            } else {
                responseData = { text: responseText };
            }
        }

        if (!n8nResponse.ok) {
            throw new Error(`n8n error ${n8nResponse.status}: ${responseText.substring(0, 100)}`);
        }

        console.log(`[AI Proxy] Request ${requestId} completed successfully`);

        // Update ai_requests with result using service role
        console.log(`[AI Proxy] Request ${requestId} completed successfully, updating DB...`);
        const { error: completionError } = await supabase.from('ai_requests')
            .update({
                status: 'completed',
                response_data: responseData,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (completionError) {
            console.error(`[AI Proxy] Failed to update request ${requestId} to completed:`, completionError.message);
        }

        // If it was a cover generation, update the book's cover_url using service role
        if (payload.action === 'GENERATE_COVER' && responseData && responseData.cover_url) {
            console.log(`[AI Proxy] Updating cover_url for book ${payload.bookId}: ${responseData.cover_url}`);
            const { error: coverUpdateError } = await supabase.from('books')
                .update({ 
                    cover_url: responseData.cover_url,
                    updated_at: new Date().toISOString()
                })
                .eq('id', payload.bookId);
            
            if (coverUpdateError) {
                console.error(`[AI Proxy] Failed to update book ${payload.bookId} cover_url:`, coverUpdateError.message);
            }
        }

    } catch (error) {
        console.error(`[AI Proxy] Request ${requestId} failed:`, error.message);

        // Update ai_requests with error
        // Re-create client in catch block if needed, or use same
        let dbClient = supabase;
        if (token) {
            dbClient = createClient(
                process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
                process.env.VITE_SUPABASE_ANON_KEY || "",
                { global: { headers: { Authorization: `Bearer ${token}` } } }
            );
        }

        // Update ai_requests with error using service role
        const { error: finalErrorUpdate } = await supabase.from('ai_requests')
            .update({
                status: 'failed',
                error_message: error.message,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);
        
        if (finalErrorUpdate) {
            console.error(`[AI Proxy] Failed to record failure for request ${requestId}:`, finalErrorUpdate.message);
        }
    }
}

/**
 * GET /api/ai-agent/status/:requestId
 * Check the status of an async AI request
 */
app.get("/api/ai-agent/status/:requestId", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split('Bearer ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Create a scoped Supabase client for this user
        const scopedSupabase = createClient(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
            process.env.VITE_SUPABASE_ANON_KEY || "",
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const requestId = req.params.requestId;

        // Query ai_requests table using scoped client
        const { data: request, error } = await scopedSupabase
            .from('ai_requests')
            .select('*')
            .eq('id', requestId)
            // .eq('user_id', user.id) // RLS handles this, but extra safety doesn't hurt
            .single();

        if (error || !request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        res.json({
            status: request.status,
            data: request.response_data,
            error: request.error_message,
            created_at: request.created_at,
            updated_at: request.updated_at
        });
    } catch (err) {
        console.error('[AI Proxy] Status check error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/ai-agent
 * Creates async AI request and returns immediately with requestId.
 * Frontend should poll /api/ai-agent/status/:requestId for result.
 */
app.post("/api/ai-agent", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }

        const token = authHeader.substring(7);

        // Create a scoped Supabase client for this user
        // This allows us to interact with the DB acting AS the user, respecting RLS
        const scopedSupabase = createClient(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
            process.env.VITE_SUPABASE_ANON_KEY || "",
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Get user from the scoped client
        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();

        if (authError || !user) {
            console.error("[AI Proxy] Auth error:", authError?.message);
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        const { action, bookId } = req.body;
        if (!action) {
            return res.status(400).json({ error: "Missing 'action' parameter" });
        }

        // Create ai_requests record using the scoped client
        const { data: aiRequest, error: insertError } = await scopedSupabase
            .from('ai_requests')
            .insert({
                user_id: user.id,
                book_id: bookId,
                action: action,
                status: 'pending',
                request_payload: req.body
            })
            .select()
            .single();

        if (insertError) {
            console.error("[AI Proxy] Failed to create ai_request:", insertError);
            return res.status(500).json({ error: "Failed to queue request: " + insertError.message });
        }

        console.log(`[AI Proxy] Created async request ${aiRequest.id} for user ${user.id}`);

        // Return immediately with requestId
        res.json({
            status: 'pending',
            requestId: aiRequest.id,
            message: 'Request queued for processing'
        });

        // Forward to n8n asynchronously (don't await)
        // Pass the token so `forwardToN8n` can also create a scoped client to update the record
        forwardToN8n(aiRequest.id, user.id, req.body, token).catch(err => {
            console.error('[AI Proxy] Background n8n forward error:', err);
        });

    } catch (err) {
        console.error("[AI Proxy] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- COVER UPLOAD ENDPOINT (For n8n) ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/upload-cover
 * Receives a cover image from n8n and uploads it to Supabase Storage.
 * Then updates the book's cover_url.
 */
app.post("/api/upload-cover", upload.single("image"), async (req, res) => {
    try {
        const { bookId } = req.body;
        const file = req.file;

        if (!bookId || !file) {
            console.error("[Upload] Missing bookId or file");
            return res.status(400).json({ error: "Missing bookId or image file" });
        }

        console.log(`[Upload] Processing cover for book ${bookId}, size: ${file.size} bytes`);

        const fileName = `${bookId}_cover.png`;
        
        // Use the global supabase client (with service role if available)
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('covers')
            .upload(fileName, file.buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error("[Upload] Supabase Storage error:", uploadError);
            return res.status(500).json({ error: "Failed to upload to storage: " + uploadError.message });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('covers')
            .getPublicUrl(fileName);

        // Update book record
        const { error: dbError } = await supabase
            .from('books')
            .update({ 
                cover_url: publicUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', bookId);

        if (dbError) {
            console.error("[Upload] Database update error:", dbError);
            return res.status(500).json({ error: "Failed to update book record: " + dbError.message });
        }

        console.log(`[Upload] Success! Cover URL: ${publicUrl}`);

        res.json({
            success: true,
            cover_url: publicUrl,
            message: "Cover uploaded and record updated successfully"
        });

    } catch (err) {
        console.error("[Upload] Server error:", err);
        res.status(500).json({ error: "Internal server error: " + err.message });
    }
});

// --- SHARED SANITIZATION ENDPOINT ---


app.post("/api/sanitize", (req, res) => {
    const { text, method } = req.body;
    let cleanText = text || "";

    try {
        if (method === 'chapter_title') {
            cleanText = editorialCasing(cleanChapterTitle(normalizeText(removeEmojis(cleanText))));
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

// Export app for Vercel
module.exports = app;

// Only start server if not in Vercel
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server (Vercel Compatible) running on port ${PORT}`);
    });
}
