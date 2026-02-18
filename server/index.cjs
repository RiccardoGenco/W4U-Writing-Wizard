const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const Epub = require("epub-gen");
const docx = require("docx");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");

// Conditional Puppeteer Import
let puppeteer;
let chromium;

if (process.env.VERCEL) {
    // Vercel / AWS Lambda environment
    try {
        puppeteer = require("puppeteer-core");
        chromium = require("@sparticuz/chromium");
    } catch (e) {
        console.error("Vercel dependencies missing:", e);
    }
} else {
    // Local / Standard Node environment
    try {
        puppeteer = require("puppeteer");
    } catch (e) {
        console.error("Local puppeteer missing:", e);
    }
}

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
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

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
        const cleanAuthor = book.author || "Autore";

        // Process Content with Production-Grade Logic
        const content = chapters.map((ch, index) => {
            const fullTitle = formatChapterTitle(index, ch.title || "Senza titolo");

            // Content Sanitization
            const cleanMarkdown = normalizeText(removeEmojis(ch.content || ""));
            const semanticHtml = marked.parse(cleanMarkdown);

            return {
                title: fullTitle,
                data: `<div lang="it"><h1>${fullTitle}</h1><div>${semanticHtml}</div></div>`,
            };
        });

        const exportUuid = uuidv4();
        const outputPath = getTempPath(`export_${bookId}_${exportUuid}.epub`);

        const options = {
            title: cleanBookTitle,
            author: cleanAuthor,
            publisher: "W4U",
            content: content,
            appendChapterTitles: false,
            lang: "it",
            uuid: exportUuid,
            output: outputPath,
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

        const { data: chapters, error: chaptersError } = await supabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });

        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "W4U Writing Wizard";
        const publisher = "W4U";

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            Header, Footer, PageNumber, convertInchesToTwip,
            InternalHyperlink } = docx;

        const processedChapters = chapters.map((ch, index) => {
            const rawTitle = ch.title || "Senza titolo";
            const fullTitle = formatChapterTitle(index, rawTitle);
            const cleanMarkdown = normalizeText(removeEmojis(ch.content || ""));
            const htmlContent = marked.parse(cleanMarkdown);

            return {
                number: index + 1,
                title: fullTitle,
                htmlContent: htmlContent,
                bookmarkId: `chapter_${index + 1}`
            };
        });

        const children = [];

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
                text: publisher,
                alignment: AlignmentType.CENTER,
                font: { name: "Georgia", size: 24 }
            }),
            new Paragraph({ text: "", pageBreakBefore: true })
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
                    spacing: { before: 240, after: 240 },
                    bookmark: { id: ch.bookmarkId }
                })
            );

            // Simple HTML-to-Paragraphs
            parseHtmlToParagraphs(ch.htmlContent).forEach(p => children.push(p));

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
        const { marked } = await import("marked");

        // Fetch Data
        const { data: book, error: bookError } = await supabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();
        if (bookError || !book) throw new Error("Book not found");

        const { data: chapters, error: chaptersError } = await supabase
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });
        if (chaptersError || !chapters) throw new Error("Chapters not found");

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "Autore";

        // Build HTML for PDF
        let htmlContent = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <style>
                @page {
                    margin: 2cm;
                    size: A4;
                }
                body { font-family: 'Georgia', serif; line-height: 1.6; color: #000; }
                .title-page { text-align: center; margin-top: 30%; page-break-after: always; }
                h1.book-title { font-size: 3em; margin-bottom: 0.5em; }
                h2.author { font-size: 1.5em; font-weight: normal; color: #555; }
                
                .toc { page-break-after: always; }
                .toc h1 { text-align: center; }
                .toc-item { margin: 0.5em 0; }
                .toc-item a { text-decoration: none; color: #000; border-bottom: 1px dotted #ccc; display: block; width: 100%; }
                
                .chapter { page-break-before: always; }
                .chapter-title { text-align: center; font-size: 2em; margin-top: 2em; margin-bottom: 2em; font-weight: bold; }
                .content p { text-indent: 1.5em; margin-bottom: 0.5em; text-align: justify; }
                .content p:first-of-type { text-indent: 0; }
            </style>
        </head>
        <body>
            <div class="title-page">
                <h1 class="book-title">${cleanBookTitle}</h1>
                <h2 class="author">di ${cleanAuthor}</h2>
                <div style="margin-top: 4em;">W4U Edition</div>
            </div>

            <div class="toc">
                <h1>Indice</h1>
                ${chapters.map((ch, i) => `
                    <div class="toc-item">
                        <a href="#ch${i + 1}">${formatChapterTitle(i, ch.title || "Senza titolo")}</a>
                    </div>
                `).join('')}
            </div>
            
            ${chapters.map((ch, i) => `
                <div class="chapter" id="ch${i + 1}">
                    <h1 class="chapter-title">${formatChapterTitle(i, ch.title || "Senza titolo")}</h1>
                    <div class="content">
                        ${marked.parse(normalizeText(removeEmojis(ch.content || "")))}
                    </div>
                </div>
            `).join('')}
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

// --- AI AGENT PROXY (ASYNC WITH POLLING) ---

/**
 * Async helper to forward requests to n8n in the background.
 * Updates ai_requests table with results when complete.
 */
async function forwardToN8n(requestId, userId, payload) {
    try {
        const n8nWebhookUrlRaw = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL;

        // Ensure absolute URL for Node fetch
        const n8nWebhookUrl = n8nWebhookUrlRaw?.startsWith('/')
            ? `https://auto.mamadev.org${n8nWebhookUrlRaw}`
            : n8nWebhookUrlRaw;

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

        // Update status to processing
        await supabase.from('ai_requests')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        console.log(`[AI Proxy] Forwarding request ${requestId} to n8n: ${n8nWebhookUrl}`);

        const n8nResponse = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: n8nHeaders,
            body: JSON.stringify(n8nPayload)
        });

        const responseData = await n8nResponse.json();

        if (!n8nResponse.ok) {
            throw new Error(`n8n error ${n8nResponse.status}: ${JSON.stringify(responseData)}`);
        }

        console.log(`[AI Proxy] Request ${requestId} completed successfully`);

        // Update ai_requests with result
        await supabase.from('ai_requests')
            .update({
                status: 'completed',
                response_data: responseData,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

    } catch (error) {
        console.error(`[AI Proxy] Request ${requestId} failed:`, error.message);

        // Update ai_requests with error
        await supabase.from('ai_requests')
            .update({
                status: 'failed',
                error_message: error.message,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);
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

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const requestId = req.params.requestId;

        // Query ai_requests table
        const { data: request, error } = await supabase
            .from('ai_requests')
            .select('*')
            .eq('id', requestId)
            .eq('user_id', user.id)
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

        // Verify JWT with Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error("[AI Proxy] Auth error:", authError?.message);
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        const { action, bookId } = req.body;
        if (!action) {
            return res.status(400).json({ error: "Missing 'action' parameter" });
        }

        // Create ai_requests record
        const { data: aiRequest, error: insertError } = await supabase
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
            return res.status(500).json({ error: "Failed to queue request" });
        }

        console.log(`[AI Proxy] Created async request ${aiRequest.id} for user ${user.id}`);

        // Return immediately with requestId
        res.json({
            status: 'pending',
            requestId: aiRequest.id,
            message: 'Request queued for processing'
        });

        // Forward to n8n asynchronously (don't await)
        forwardToN8n(aiRequest.id, user.id, req.body).catch(err => {
            console.error('[AI Proxy] Background n8n forward error:', err);
        });

    } catch (err) {
        console.error("[AI Proxy] Error:", err);
        res.status(500).json({ error: err.message });
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
