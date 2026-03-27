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

app.get("/api/db/schema-health", async (req, res) => {
    try {
        const checks = await Promise.all(REQUIRED_SUPABASE_TABLES.map((table) => checkSupabaseTableExists(table)));
        const missing = checks.filter((check) => !check.exists);

        res.status(missing.length > 0 ? 500 : 200).json({
            status: missing.length > 0 ? 'incomplete' : 'ok',
            checks,
            missing_tables: missing.map((item) => item.table)
        });
    } catch (error) {
        console.error('[DB Schema Health] Error:', error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});


const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

const n8nWebhookUrlRaw = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL;
const N8N_WEBHOOK_URL = n8nWebhookUrlRaw?.startsWith('/')
    ? `https://auto.mamadev.org${n8nWebhookUrlRaw}`
    : n8nWebhookUrlRaw;

// Idempotency for orchestration
const activeRuns = new Set();

// Centralized logger for backend
const logDebug = async (source, eventType, payload, bookId = null) => {
    try {
        await supabase.from('debug_logs').insert({
            source,
            event_type: eventType,
            payload,
            book_id: bookId || null
        });
    } catch (e) {
        console.error("[Backend Debug] Failed to log to DB:", e.message);
    }
};

const createScopedSupabaseFromToken = (token) => createClient(
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

const getWordsPerPage = (book) => {
    const fromConfig = Number(book?.configuration?.words_per_page);
    const fromContext = Number(book?.context_data?.configuration?.words_per_page);
    if (Number.isFinite(fromConfig) && fromConfig > 0) return Math.round(fromConfig);
    if (Number.isFinite(fromContext) && fromContext > 0) return Math.round(fromContext);
    return 300;
};

const getExpectedParagraphsPerChapter = (book) => {
    const targetPages = Number(book?.target_pages || book?.context_data?.target_pages);
    const targetChapters = Number(book?.target_chapters || 0);
    if (!Number.isFinite(targetPages) || targetPages <= 0) return null;
    if (!Number.isFinite(targetChapters) || targetChapters <= 0) return null;
    // Keep orchestration aligned with blueprint scaffolding:
    // one planned paragraph slot per target page assigned to the chapter.
    return Math.max(1, Math.round(targetPages / targetChapters));
};

const getTargetWordsPerChapter = (book) => {
    const targetPages = Number(book?.target_pages || book?.context_data?.target_pages);
    const targetChapters = Number(book?.target_chapters || 0);
    const wordsPerPage = getWordsPerPage(book);

    if (!Number.isFinite(targetPages) || targetPages <= 0) {
        return Math.round(wordsPerPage * 5);
    }

    if (!Number.isFinite(targetChapters) || targetChapters <= 0) {
        return Math.round(targetPages * wordsPerPage);
    }

    return Math.max(250, Math.round((targetPages * wordsPerPage) / targetChapters));
};

const countWords = (text) => {
    if (!text || typeof text !== 'string') return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
};

async function failBookGenerationRun(runId, phase, lastError, extra = {}) {
    await supabase.from('book_generation_runs')
        .update({
            status: 'failed',
            phase,
            last_error: lastError,
            updated_at: new Date().toISOString(),
            ...extra
        })
        .eq('id', runId);
}

async function refreshBookGenerationRunState(runId, book) {
    try {
        const targetPages = Number(book?.target_pages || book?.context_data?.target_pages);
        const targetChapters = Number(book?.target_chapters || 0);
        const expectedParagraphsPerChapter = getExpectedParagraphsPerChapter(book);

        if (!Number.isFinite(targetPages) || targetPages <= 0) {
            await failBookGenerationRun(runId, 'outline', 'Missing or invalid target_pages');
            return;
        }

        const { data: chapters, error: chaptersError } = await supabase
            .from('chapters')
            .select('id, chapter_number, title, status')
            .eq('book_id', book.id)
            .order('chapter_number', { ascending: true });

        if (chaptersError) {
            await failBookGenerationRun(runId, 'outline', `Failed to load chapters: ${chaptersError.message}`);
            return;
        }

        const chaptersCount = chapters?.length || 0;
        const targetTotalWords = Math.round(targetPages * getWordsPerPage(book));
        if (chaptersCount === 0) {
            await failBookGenerationRun(runId, 'outline', 'Outline missing: no chapters found for book');
            return;
        }

        if (Number.isFinite(targetChapters) && targetChapters > 0 && chaptersCount !== Math.round(targetChapters)) {
            await failBookGenerationRun(runId, 'outline', `Outline mismatch: expected ${Math.round(targetChapters)} chapters, found ${chaptersCount}`);
            return;
        }

        const chapterIds = chapters.map(ch => ch.id);
        const { data: paragraphs, error: paragraphsError } = await supabase
            .from('paragraphs')
            .select('id, chapter_id, paragraph_number, status, actual_word_count, content')
            .in('chapter_id', chapterIds);

        if (paragraphsError) {
            await failBookGenerationRun(runId, 'scaffold', `Failed to load paragraphs: ${paragraphsError.message}`);
            return;
        }

        const paragraphsByChapter = new Map();
        for (const chapter of chapters) {
            paragraphsByChapter.set(chapter.id, []);
        }
        for (const paragraph of paragraphs || []) {
            if (!paragraphsByChapter.has(paragraph.chapter_id)) {
                paragraphsByChapter.set(paragraph.chapter_id, []);
            }
            paragraphsByChapter.get(paragraph.chapter_id).push(paragraph);
        }

        const firstIncompleteScaffold = expectedParagraphsPerChapter
            ? chapters.find(ch => (paragraphsByChapter.get(ch.id) || []).length < expectedParagraphsPerChapter)
            : chapters.find(ch => (paragraphsByChapter.get(ch.id) || []).length === 0);

        if (firstIncompleteScaffold) {
            await failBookGenerationRun(
                runId,
                'scaffold',
                expectedParagraphsPerChapter
                    ? `Scaffold incomplete for chapter ${firstIncompleteScaffold.chapter_number}: expected ${expectedParagraphsPerChapter} paragraphs`
                    : `Scaffold missing for chapter ${firstIncompleteScaffold.chapter_number}`,
                {
                    current_chapter_id: firstIncompleteScaffold.id,
                    current_chapter_number: firstIncompleteScaffold.chapter_number,
                    target_total_words: targetTotalWords,
                    expected_chapters: Number.isFinite(targetChapters) && targetChapters > 0 ? Math.round(targetChapters) : chaptersCount,
                    metadata: {
                        expected_paragraphs_per_chapter: expectedParagraphsPerChapter,
                        scaffold_ready_chapters: chapters.filter(ch => (paragraphsByChapter.get(ch.id) || []).length >= (expectedParagraphsPerChapter || 1)).length,
                        chapters_count: chaptersCount
                    }
                }
            );
            return;
        }

        const actualTotalWords = (paragraphs || []).reduce((acc, p) => {
            const isPlausibleWordCount =
                Number.isFinite(p.actual_word_count) &&
                p.actual_word_count > 1 &&
                !(p.content && p.content.length > 100 && p.actual_word_count < 10);
            if (isPlausibleWordCount) return acc + Number(p.actual_word_count);
            return acc + countWords(p.content);
        }, 0);

        const nextChapter = chapters.find(ch => {
            const chParagraphs = paragraphsByChapter.get(ch.id) || [];
            const hasPending = chParagraphs.some(p => p.status !== 'COMPLETED' || !p.content || p.content.length <= 20);
            return ch.status !== 'COMPLETED' || hasPending;
        }) || null;

        const { error } = await supabase.from('book_generation_runs')
            .update({
                status: nextChapter ? 'writing' : 'review',
                phase: nextChapter ? 'write_chapter' : 'final_review',
                current_chapter_id: nextChapter?.id || null,
                current_chapter_number: nextChapter?.chapter_number || null,
                target_total_words: targetTotalWords,
                actual_total_words: actualTotalWords,
                expected_chapters: Number.isFinite(targetChapters) && targetChapters > 0 ? Math.round(targetChapters) : null,
                completed_chapters: chapters.filter(ch => ch.status === 'COMPLETED').length,
                last_error: null,
                metadata: {
                    book_status: book?.status || null,
                    chapters_count: chaptersCount,
                    expected_paragraphs_per_chapter: expectedParagraphsPerChapter
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', runId);

        if (error) {
            console.error(`[Book Generation] Failed to refresh run ${runId}:`, error.message);
        }
    } catch (error) {
        console.error(`[Book Generation] Planning gate failed for run ${runId}:`, error.message);
        await failBookGenerationRun(runId, 'outline', error.message);
    }
}

async function getBookGenerationRun(runId) {
    const { data, error } = await supabase
        .from('book_generation_runs')
        .select('*')
        .eq('id', runId)
        .single();

    if (error || !data) {
        throw new Error(`Run not found: ${runId}`);
    }

    return data;
}

async function getBookForGeneration(bookId) {
    const { data, error } = await supabase
        .from('books')
        .select('id, title, status, target_pages, target_chapters, context_data, configuration')
        .eq('id', bookId)
        .single();

    if (error || !data) {
        throw new Error(`Book not found: ${bookId}`);
    }

    return data;
}

async function getChapterWithParagraphs(chapterId) {
    const { data: chapter, error: chapterError } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();

    if (chapterError || !chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
    }

    const { data: paragraphs, error: paragraphsError } = await supabase
        .from('paragraphs')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('paragraph_number', { ascending: true });

    if (paragraphsError) {
        throw new Error(`Failed to load paragraphs for chapter ${chapterId}: ${paragraphsError.message}`);
    }

    return { chapter, paragraphs: paragraphs || [] };
}

async function ensureSuccess(promise, contextMessage = 'Database operation') {
    const res = await promise;
    if (res.error) {
        throw new Error(`${contextMessage} failed: ${res.error.message}`);
    }
    return res;
}

async function createAiRequestAndWait({ userId, bookId, action, payload, timeoutMs = 10 * 60 * 1000 }) { // Increased default to 10 min
    // 1. Deduplication: check for existing pending/processing request for same book + action + chapter
    const { data: pendingRequests, error: findError } = await supabase
        .from('ai_requests')
        .select('*')
        .eq('book_id', bookId)
        .eq('action', action)
        .in('status', ['pending', 'processing', 'started']);

    let aiRequestId = null;
    if (!findError && pendingRequests && pendingRequests.length > 0) {
        const targetChapter = payload.chapterId;
        const match = pendingRequests.find(r => {
            const rChapter = r.request_payload ? r.request_payload.chapterId : null;
            return rChapter === targetChapter;
        });
        if (match) {
            console.log(`[Book Generation] Deduplicating AI request for ${action}. Reusing ${match.id}`);
            aiRequestId = match.id;
        }
    }

    // 2. Create if not found
    if (!aiRequestId) {
        const { data: aiRequest, error: insertError } = await supabase
            .from('ai_requests')
            .insert({
                user_id: userId,
                book_id: bookId,
                action,
                status: 'pending',
                request_payload: payload
            })
            .select()
            .single();

        if (insertError || !aiRequest) {
            throw new Error(`Failed to create ai_request for ${action}: ${insertError?.message}`);
        }

        aiRequestId = aiRequest.id;

        forwardToN8n(aiRequestId, userId, { ...payload, action, bookId }, null).catch(async (err) => {
            console.error(`[Book Generation] Worker dispatch failed for ${action}:`, err.message);
            await supabase.from('ai_requests')
                .update({
                    status: 'failed',
                    error_message: err.message,
                    updated_at: new Date().toISOString()
                })
                .eq('id', aiRequestId);
        });
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000 to 1000

        const { data: current, error } = await supabase
            .from('ai_requests')
            .select('*')
            .eq('id', aiRequestId)
            .single();

        if (error || !current) {
            throw new Error(`ai_request disappeared while waiting for ${action}`);
        }

        if (current.status === 'completed') {
            return current;
        }

        if (current.status === 'failed') {
            throw new Error(current.error_message || `${action} failed`);
        }
    }

    await supabase.from('ai_requests')
        .update({
            status: 'failed',
            error_message: `Timeout waiting for ${action}`,
            updated_at: new Date().toISOString()
        })
        .eq('id', aiRequestId);

    throw new Error(`Timeout waiting for ${action}`);
}

async function finalizeChapterIfReady(chapterId) {
    const { chapter, paragraphs } = await getChapterWithParagraphs(chapterId);
    const allDone = paragraphs.length > 0 && paragraphs.every(p => p.status === 'COMPLETED' && p.content && p.content.length > 20);
    if (!allDone) {
        return null;
    }

    const compiledContent = paragraphs.map(p => p.content || '').filter(Boolean).join('\n\n');
    const actualWordCount = paragraphs.reduce((acc, p) => {
        const isPlausibleWordCount =
            Number.isFinite(p.actual_word_count) &&
            p.actual_word_count > 1 &&
            !(p.content && p.content.length > 100 && p.actual_word_count < 10);
        if (isPlausibleWordCount) return acc + Number(p.actual_word_count);
        return acc + countWords(p.content);
    }, 0);

    await supabase.from('chapters')
        .update({
            content: compiledContent,
            actual_word_count: actualWordCount,
            status: 'COMPLETED',
            updated_at: new Date().toISOString()
        })
        .eq('id', chapter.id);

    return {
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        paragraphsCount: paragraphs.length,
        actualWordCount,
        contentLength: compiledContent.length
    };
}

async function validateCompletedChapter(chapterId, book) {
    const { chapter, paragraphs } = await getChapterWithParagraphs(chapterId);
    const targetWordsPerChapter = getTargetWordsPerChapter(book);
    const minAllowedWords = Math.max(500, Math.floor(targetWordsPerChapter * 0.9));
    const maxAllowedWords = Math.ceil(targetWordsPerChapter * 1.35);
    const expectedParagraphsPerChapter = getExpectedParagraphsPerChapter(book);
    const actualWordCount = paragraphs.reduce((acc, p) => {
        // Detect comma-shifting bug: actual_word_count stored as 1 even if content is long
        // This happens when n8n passes parameters as a comma-separated string instead of array
        const isPlausibleWordCount =
            Number.isFinite(p.actual_word_count) &&
            p.actual_word_count > 1 &&
            // If content exists and is long, actual_word_count should be proportional
            !(p.content && p.content.length > 100 && p.actual_word_count < 10);
        if (isPlausibleWordCount) {
            return acc + Number(p.actual_word_count);
        }
        // Fallback: count from actual content text (comma-shift-proof)
        const fromContent = countWords(p.content);
        if (fromContent > 0 && p.actual_word_count !== fromContent) {
            console.warn(`[validateCompletedChapter] Paragraph ${p.id} has actual_word_count=${p.actual_word_count} but content has ${fromContent} words. Using content count.`);
        }
        return acc + fromContent;
    }, 0);


    const invalidParagraph = paragraphs.find((p) => p.status !== 'SKIPPED' && (!p.content || p.content.length <= 20));
    if (invalidParagraph) {
        await supabase.from('chapters')
            .update({ status: 'PENDING', updated_at: new Date().toISOString() })
            .eq('id', chapter.id);

        const errorMsg = `Chapter ${chapter.chapter_number} validation failed: paragraph ${invalidParagraph.paragraph_number} (${invalidParagraph.title || 'Untitled'}) is empty or too short. Total words counted: ${actualWordCount}.`;
        console.error(`[validateCompletedChapter] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    if (expectedParagraphsPerChapter && paragraphs.length !== expectedParagraphsPerChapter) {
        await supabase.from('chapters')
            .update({ status: 'PENDING', updated_at: new Date().toISOString() })
            .eq('id', chapter.id);
        throw new Error(`Chapter ${chapter.chapter_number} validation failed: expected ${expectedParagraphsPerChapter} paragraphs, found ${paragraphs.length}`);
    }

    if (actualWordCount < minAllowedWords) {
        await supabase.from('chapters')
            .update({ status: 'PENDING', updated_at: new Date().toISOString() })
            .eq('id', chapter.id);
        throw new Error(`Chapter ${chapter.chapter_number} validation failed: ${actualWordCount} words is below minimum ${minAllowedWords}`);
    }

    if (actualWordCount > maxAllowedWords) {
        await supabase.from('chapters')
            .update({ status: 'PENDING', updated_at: new Date().toISOString() })
            .eq('id', chapter.id);
        throw new Error(`Chapter ${chapter.chapter_number} validation failed: ${actualWordCount} words exceeds maximum ${maxAllowedWords}`);
    }

    return {
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        actualWordCount,
        targetWordsPerChapter,
        minAllowedWords,
        maxAllowedWords,
        paragraphsCount: paragraphs.length
    };
}

async function processCurrentChapter(run, book) {
    if (!run.current_chapter_id) {
        throw new Error('Run missing current_chapter_id');
    }

    const MAX_EXPANSION_RETRIES = 3;
    const expectedParagraphsPerChapter = getExpectedParagraphsPerChapter(book);
    const targetWordsPerChapter = getTargetWordsPerChapter(book);
    const { chapter, paragraphs } = await getChapterWithParagraphs(run.current_chapter_id);

    if (paragraphs.length === 0) {
        throw new Error(`Chapter ${chapter.chapter_number} has no scaffold paragraphs`);
    }

    if (expectedParagraphsPerChapter && paragraphs.length < expectedParagraphsPerChapter) {
        throw new Error(`Chapter ${chapter.chapter_number} scaffold incomplete`);
    }

    const hasPendingParagraphs = paragraphs.some(p => p.status !== 'COMPLETED' || !p.content || p.content.length <= 20);

    // If all paragraphs are already written, skip directly to validation
    if (!hasPendingParagraphs) {
        const finalizedAlready = await finalizeChapterIfReady(chapter.id);
        if (!finalizedAlready) {
            throw new Error(`Chapter ${chapter.chapter_number} is marked complete but cannot be finalized`);
        }
        // Still run through the expansion-aware validation below
    } else {
        // --- WRITE PHASE: SPLIT GENERATION (TWO PARTS) ---
        await supabase.from('book_generation_runs')
            .update({
                status: 'writing',
                phase: 'write_chapter',
                current_chapter_id: chapter.id,
                current_chapter_number: chapter.chapter_number,
                metadata: {
                    ...(run.metadata || {}),
                    active_paragraph_id: null,
                    active_paragraph_number: null,
                    expected_paragraphs_in_chapter: paragraphs.length,
                    target_words_for_chapter: targetWordsPerChapter
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', run.id);

        const totalParagraphs = paragraphs.length;
        const midPoint = Math.ceil(totalParagraphs / 2);

        // Sort paragraphs to be safe
        const sortedParagraphs = [...paragraphs].sort((a, b) => a.paragraph_number - b.paragraph_number);

        const part1Range = [sortedParagraphs[0].paragraph_number, sortedParagraphs[midPoint - 1].paragraph_number];
        const part2Range = [sortedParagraphs[midPoint].paragraph_number, sortedParagraphs[totalParagraphs - 1].paragraph_number];

        console.log(`[Book Generation] Chapter ${chapter.chapter_number}: Initiating SPLIT GENERATION (Parallel). Part 1: ${part1Range[0]}-${part1Range[1]}, Part 2: ${part2Range[0]}-${part2Range[1]}`);

        // Generate Part 1 and Part 2 in Parallel
        await Promise.all([
            createAiRequestAndWait({
                userId: run.created_by,
                bookId: book.id,
                action: 'WRITE_CHAPTER_FROM_PLAN',
                payload: {
                    chapterId: chapter.id,
                    bookId: book.id,
                    targetWordCount: Math.round(targetWordsPerChapter / 2),
                    paragraphRange: part1Range,
                    partNumber: 1,
                    totalParts: 2
                }
            }),
            createAiRequestAndWait({
                userId: run.created_by,
                bookId: book.id,
                action: 'WRITE_CHAPTER_FROM_PLAN',
                payload: {
                    chapterId: chapter.id,
                    bookId: book.id,
                    targetWordCount: Math.round(targetWordsPerChapter / 2),
                    paragraphRange: part2Range,
                    partNumber: 2,
                    totalParts: 2
                }
            })
        ]);


        const finalized = await finalizeChapterIfReady(chapter.id);
        if (!finalized) {
            throw new Error(`Chapter ${chapter.chapter_number} is still incomplete after chapter generation`);
        }
    }

    // --- VALIDATION + EXPANSION RETRY LOOP ---
    let lastValidation = null;
    for (let attempt = 0; attempt <= MAX_EXPANSION_RETRIES; attempt++) {
        try {
            lastValidation = await validateCompletedChapter(chapter.id, book);
            // Validation passed — break out of retry loop
            break;
        } catch (validationError) {
            const isWordCountError = validationError.message && validationError.message.includes('below minimum');

            if (!isWordCountError) {
                // Not a word count issue — propagate immediately
                throw validationError;
            }

            if (attempt >= MAX_EXPANSION_RETRIES) {
                // Max retries exceeded — GRACEFUL DEGRADATION
                // Accept the chapter as-is instead of failing the entire run
                console.warn(`[Expansion] Chapter ${chapter.chapter_number}: max retries exhausted. Accepting chapter with current word count.`);

                // Force-finalize the chapter regardless of word count
                const { paragraphs: finalParagraphs } = await getChapterWithParagraphs(chapter.id);
                const finalCompiledContent = finalParagraphs.map(p => p.content || '').filter(Boolean).join('\n\n');
                const finalWordCount = countWords(finalCompiledContent);

                await supabase.from('chapters')
                    .update({
                        content: finalCompiledContent,
                        actual_word_count: finalWordCount,
                        status: 'COMPLETED',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', chapter.id);

                lastValidation = {
                    actualWordCount: finalWordCount,
                    minAllowedWords: Math.max(500, Math.floor(targetWordsPerChapter * 0.9)),
                    maxAllowedWords: Math.ceil(targetWordsPerChapter * 1.35)
                };

                console.log(`[Expansion] Chapter ${chapter.chapter_number} accepted with ${finalWordCount} words (graceful degradation).`);
                break;
            }

            // --- EXPANSION PHASE ---
            const { paragraphs: currentParagraphs } = await getChapterWithParagraphs(chapter.id);
            const compiledText = currentParagraphs.map(p => p.content || '').filter(Boolean).join('\n\n');
            const currentWordCount = countWords(compiledText);
            const minRequired = Math.max(500, Math.floor(targetWordsPerChapter * 0.9));
            const deficit = minRequired - currentWordCount + 150; // +150 buffer to avoid marginal pass

            console.log(`[Expansion] Chapter ${chapter.chapter_number}: ${currentWordCount} words, need ${minRequired}. Deficit: ${deficit}. Attempt ${attempt + 1}/${MAX_EXPANSION_RETRIES}`);

            await supabase.from('book_generation_runs')
                .update({
                    metadata: {
                        ...(run.metadata || {}),
                        expansion_attempt: attempt + 1,
                        expansion_deficit: deficit,
                        pre_expansion_words: currentWordCount
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('id', run.id);

            try {
                // Call EXPAND_CHAPTER via n8n
                const expandResult = await createAiRequestAndWait({
                    userId: run.created_by,
                    bookId: book.id,
                    action: 'EXPAND_CHAPTER',
                    payload: {
                        chapterId: chapter.id,
                        bookId: book.id,
                        fullText: compiledText,
                        currentWordCount,
                        deficit,
                        targetWordCount: minRequired + 150,
                        paragraphCount: currentParagraphs.length
                    }
                });

                // Parse expanded text from the ai_request response
                let expandedText = '';
                if (expandResult.response_data) {
                    const responseData = typeof expandResult.response_data === 'string'
                        ? JSON.parse(expandResult.response_data)
                        : expandResult.response_data;
                    expandedText = responseData?.expandedText || responseData?.text || responseData?.content || '';
                }

                const expandedWordCount = countWords(expandedText);

                // Use WORD COUNT comparison, not character length
                if (!expandedText || expandedWordCount <= currentWordCount) {
                    console.warn(`[Expansion] Attempt ${attempt + 1}: expanded text has ${expandedWordCount} words (was ${currentWordCount}). No improvement, will retry or degrade.`);
                    // Don't throw — just continue to next attempt
                    continue;
                }

                console.log(`[Expansion] Attempt ${attempt + 1}: expanded from ${currentWordCount} to ${expandedWordCount} words (+${expandedWordCount - currentWordCount}).`);

                // Split expanded text back into paragraphs proportionally
                // Robust splitting logic
                let expandedSections = expandedText.split(/\n{2,}/).filter(s => s.trim().length > 0);
                const paragraphsToUpdate = currentParagraphs.sort((a, b) => a.paragraph_number - b.paragraph_number);

                // Defensive check: if sections are too few, try splitting by single newline
                if (expandedSections.length < paragraphsToUpdate.length) {
                    const fallbackSections = expandedText.split(/\n/).filter(s => s.trim().length > 20);
                    if (fallbackSections.length >= paragraphsToUpdate.length) {
                        console.log(`[Expansion] Using single newline fallback split. Sections: ${fallbackSections.length}`);
                        expandedSections = fallbackSections;
                    }
                }

                const totalSections = expandedSections.length;
                const totalParagraphs = paragraphsToUpdate.length;

                if (totalSections < totalParagraphs) {
                    console.warn(`[Expansion] Warning: LLM returned ${totalSections} sections, expected ${totalParagraphs}. Attempting softer split...`);
                    const softerSections = expandedText.split(/\n/).filter(s => s.trim().length > 10);
                    if (softerSections.length >= totalParagraphs) {
                        expandedSections = softerSections;
                        console.log(`[Expansion] Softer split successful: ${expandedSections.length} sections.`);
                    }
                }

                if (expandedSections.length >= totalParagraphs) {
                    // Sequential distribution: distribute extra sections to the first paragraphs
                    const baseCount = Math.floor(totalSections / totalParagraphs);
                    let extra = totalSections % totalParagraphs;
                    let currentIndex = 0;

                    console.log(`[Expansion] Distributing ${totalSections} sections into ${totalParagraphs} paragraphs (Base: ${baseCount}, Extras: ${extra})`);

                    for (let i = 0; i < totalParagraphs; i++) {
                        const count = baseCount + (extra > 0 ? 1 : 0);
                        if (extra > 0) extra--;

                        const pSections = expandedSections.slice(currentIndex, currentIndex + count);
                        currentIndex += count;
                        const paragraphContent = pSections.join('\n\n');
                        const wordCount = countWords(paragraphContent);

                        console.log(`[Expansion] Updating paragraph ${paragraphsToUpdate[i].paragraph_number} with ${count} sections (${wordCount} words)`);

                        await supabase.from('paragraphs')
                            .update({
                                content: paragraphContent,
                                actual_word_count: wordCount,
                                status: 'COMPLETED',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', paragraphsToUpdate[i].id);
                    }
                } else {
                    // Critical fallback: fewer sections than paragraphs even after secondary splitting
                    console.warn(`[Expansion] FEWER SECTIONS (${totalSections}) THAN PARAGRAPHS (${totalParagraphs}). Merging into available paragraphs.`);

                    for (let i = 0; i < totalParagraphs; i++) {
                        let content = '';
                        let status = 'COMPLETED';
                        let words = 0;

                        if (i < totalSections) {
                            content = expandedSections[i];
                            words = countWords(content);
                            console.log(`[Expansion] Fallback: Paragraph ${paragraphsToUpdate[i].paragraph_number} takes section ${i}`);
                        } else {
                            // This paragraph has no section. KEEP OLD CONTENT instead of clearing if possible, 
                            // but mark as COMPLETED to pass validation if it's not empty.
                            // If it WAS empty, this is a failure of the LLM to provide enough context.
                            console.warn(`[Expansion] Fallback: Paragraph ${paragraphsToUpdate[i].paragraph_number} has NO SECTION. Keeping existing content.`);
                            content = paragraphsToUpdate[i].content || '';
                            words = countWords(content);
                            status = content.length > 20 ? 'COMPLETED' : 'PENDING';
                        }

                        await supabase.from('paragraphs')
                            .update({
                                content,
                                actual_word_count: words,
                                status,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', paragraphsToUpdate[i].id);
                    }
                }

                // Re-finalize chapter with new content
                await finalizeChapterIfReady(chapter.id);

                console.log(`[Expansion] Chapter ${chapter.chapter_number} expanded. Re-validating...`);
                // Loop continues → re-validate

            } catch (expansionError) {
                // Expansion call itself failed (timeout, n8n error, etc.)
                console.warn(`[Expansion] Attempt ${attempt + 1} failed: ${expansionError.message}. Will retry or degrade.`);
                // Don't throw — continue to next attempt or graceful degradation
                continue;
            }
        }
    }

    // Update run with successful validation
    if (lastValidation) {
        await supabase.from('book_generation_runs')
            .update({
                actual_total_words: (Number(run.actual_total_words) || 0) + lastValidation.actualWordCount,
                metadata: {
                    ...(run.metadata || {}),
                    last_completed_chapter_id: chapter.id,
                    last_completed_chapter_number: chapter.chapter_number,
                    last_completed_chapter_words: lastValidation.actualWordCount,
                    target_words_for_chapter: targetWordsPerChapter,
                    chapter_word_range: {
                        min: lastValidation.minAllowedWords,
                        max: lastValidation.maxAllowedWords
                    }
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', run.id);
    }
}


async function finalizeBookGenerationRun(runId, book) {
    const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('id, status, actual_word_count, content')
        .eq('book_id', book.id)
        .order('chapter_number', { ascending: true });

    if (chaptersError) {
        throw new Error(`Failed to load chapters during final review: ${chaptersError.message}`);
    }

    const totalWords = (chapters || []).reduce((acc, chapter) => {
        const isPlausibleWordCount =
            Number.isFinite(chapter.actual_word_count) &&
            chapter.actual_word_count > 100 && // Chapter must be longer
            !(chapter.content && chapter.content.length > 500 && chapter.actual_word_count < 50);

        if (isPlausibleWordCount) return acc + Number(chapter.actual_word_count);
        return acc + countWords(chapter.content);
    }, 0);

    const targetTotalWords = Math.round(Number(book.target_pages) * getWordsPerPage(book));
    const minAllowed = Math.floor(targetTotalWords * 0.9);
    const maxAllowed = Math.ceil(targetTotalWords * 1.1);
    const allCompleted = (chapters || []).length > 0 && chapters.every(ch => ch.status === 'COMPLETED');

    if (!allCompleted) {
        throw new Error('Final review failed: not all chapters are completed');
    }

    if (totalWords < minAllowed || totalWords > maxAllowed) {
        throw new Error(`Final review failed: total words ${totalWords} outside allowed range ${minAllowed}-${maxAllowed}`);
    }

    await supabase.from('book_generation_runs')
        .update({
            status: 'completed',
            phase: 'final_review',
            actual_total_words: totalWords,
            current_chapter_id: null,
            current_chapter_number: null,
            last_error: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', runId);
}

async function continueBookGenerationRun(runId) {
    if (activeRuns.has(runId)) {
        console.log(`[Book Generation] Run ${runId} is already active, skipping duplicate orchestration`);
        return;
    }

    activeRuns.add(runId);
    try {
        let iterations = 0;
        let stallPhase = null;
        let stallChapterId = null;
        let stallCount = 0;

        while (iterations < 50) {
            iterations += 1;
            const run = await getBookGenerationRun(runId);
            const book = await getBookForGeneration(run.book_id);

            await logDebug('server', 'book_generation_iteration', {
                runId,
                iteration: iterations,
                status: run.status,
                phase: run.phase,
                current_chapter_id: run.current_chapter_id,
                current_chapter_number: run.current_chapter_number
            }, run.book_id);

            if (run.status === 'completed' || run.status === 'failed') {
                return;
            }

            if (run.phase === stallPhase && run.current_chapter_id === stallChapterId) {
                stallCount++;
                if (stallCount >= 3) {
                    throw new Error(`Orchestration stalled for 3 iterations on phase ${stallPhase}, chapter ${stallChapterId}. Stopping loop to prevent hours-long runaway.`);
                }
            } else {
                stallPhase = run.phase;
                stallChapterId = run.current_chapter_id;
                stallCount = 1;
            }

            // Using ensureSuccess on state refresh to break the loop if DB fails
            await refreshBookGenerationRunState(runId, book);
            const refreshedRun = await getBookGenerationRun(runId);

            await logDebug('server', 'book_generation_post_refresh', {
                runId,
                iteration: iterations,
                status: refreshedRun.status,
                phase: refreshedRun.phase,
                current_chapter_id: refreshedRun.current_chapter_id,
                current_chapter_number: refreshedRun.current_chapter_number
            }, refreshedRun.book_id);

            if (refreshedRun.status === 'failed') {
                return;
            }

            if (refreshedRun.phase === 'write_chapter' && refreshedRun.current_chapter_id) {
                await processCurrentChapter(refreshedRun, book);
                continue;
            }

            if (refreshedRun.phase === 'final_review') {
                await finalizeBookGenerationRun(runId, book);
                return;
            }

            return;
        }

        await failBookGenerationRun(runId, 'write_chapter', 'Run iteration guard exceeded');
    } catch (error) {
        console.error(`[Book Generation] Run ${runId} failed during orchestration:`, error.message);
        await failBookGenerationRun(runId, 'write_chapter', error.message);
    } finally {
        activeRuns.delete(runId);
    }
}

function kickBookGenerationRun(runId, reason = 'unspecified') {
    if (!runId) return false;
    if (activeRuns.has(runId)) {
        return false;
    }

    setImmediate(() => {
        logDebug('server', 'book_generation_resume_requested', { runId, reason }).catch(() => {});
        continueBookGenerationRun(runId).catch(err => {
            console.error(`[Book Generation] Async orchestration error (${reason}):`, err.message);
        });
    });

    return true;
}

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

const REQUIRED_SUPABASE_TABLES = [
    'books',
    'chapters',
    'paragraphs',
    'ai_requests',
    'debug_logs',
    'book_generation_runs'
];

const checkSupabaseTableExists = async (tableName) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";

    if (!supabaseUrl || !serviceRoleKey) {
        return {
            table: tableName,
            exists: false,
            status: 500,
            error: 'Missing Supabase URL or service role key'
        };
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*&limit=1`, {
        method: 'GET',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
        }
    });

    if (response.ok) {
        return { table: tableName, exists: true, status: response.status, error: null };
    }

    const errorText = await response.text().catch(() => '');
    return {
        table: tableName,
        exists: false,
        status: response.status,
        error: errorText || `HTTP ${response.status}`
    };
};

const createScopedSupabaseForRequest = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error("Missing or invalid Authorization header");
    }

    const token = authHeader.split('Bearer ')[1];
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
        throw new Error("Invalid token or user not found");
    }

    return { scopedSupabase, user };
};

const buildRenderableChapters = (chapters, paragraphs) => {
    const paragraphsByChapter = new Map();
    for (const paragraph of paragraphs || []) {
        const key = paragraph.chapter_id;
        if (!paragraphsByChapter.has(key)) {
            paragraphsByChapter.set(key, []);
        }
        if (paragraph.content && paragraph.content.trim().length > 0) {
            paragraphsByChapter.get(key).push(paragraph);
        }
    }

    return (chapters || [])
        .map((chapter) => {
            const chapterParagraphs = (paragraphsByChapter.get(chapter.id) || [])
                .sort((a, b) => a.paragraph_number - b.paragraph_number);

            const compiledContent = typeof chapter.content === 'string' ? chapter.content.trim() : '';

            // Se abbiamo dei paragrafi, usiamo quelli. 
            // Ma se il chapter.content (intro legacy) è diverso dalla concatenazione dei paragrafi, lo includiamo come intro.
            const paragraphsText = chapterParagraphs.map(p => p.content || '').join('\n\n').trim();
            const isDifferentFromParagraphs = compiledContent !== '' && compiledContent !== paragraphsText;

            const exportCompiledContent = (chapterParagraphs.length === 0 || isDifferentFromParagraphs) ? compiledContent : '';
            const hasRenderableContent = chapterParagraphs.length > 0 || exportCompiledContent.length > 0;

            return {
                ...chapter,
                exportParagraphs: chapterParagraphs,
                exportCompiledContent,
                hasRenderableContent
            };
        });
};

const loadExportBundle = async (scopedSupabase, bookId) => {
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
        .order("chapter_number", { ascending: true });

    if (chaptersError || !chapters || chapters.length === 0) {
        throw new Error("Chapters not found");
    }

    const chapterIds = chapters.map((chapter) => chapter.id);
    const { data: paragraphs, error: paragraphsError } = await scopedSupabase
        .from("paragraphs")
        .select("*")
        .in("chapter_id", chapterIds)
        .order("paragraph_number", { ascending: true });

    if (paragraphsError) throw new Error("Paragraphs not found");

    const renderableChapters = buildRenderableChapters(chapters, paragraphs || []);

    // Verifica che TUTTI i capitoli abbiano contenuto. Se filter ridurrebbe la lunghezza, significa che qualcuno è vuoto.
    const emptyChapters = renderableChapters.filter(ch => !ch.hasRenderableContent);
    if (emptyChapters.length > 0) {
        const chapterNumbers = emptyChapters.map(ch => ch.chapter_number).join(', ');
        throw new Error(`Export blocked: Chapters [${chapterNumbers}] have no renderable content (please generate them first).`);
    }

    const { data: promptData } = await scopedSupabase
        .from("system_prompts")
        .select("*")
        .filter('key', 'ilike', 'courtesy_%');

    const prompts = (promptData || []).reduce((acc, curr) => ({ ...acc, [curr.key]: curr.prompt_text }), {});

    return {
        book,
        chapters: renderableChapters,
        paragraphs: paragraphs || [],
        prompts
    };
};

const getBackCoverBlurb = (book) => {
    // Prioritize the manually generated blurb from Cover Generation page
    const manualBlurb = book?.context_data?.back_cover_blurb;
    if (manualBlurb) return manualBlurb;

    const summary = normalizeText(removeEmojis(book?.plot_summary || ""));
    if (summary) {
        return summary.length > 900 ? `${summary.slice(0, 897)}...` : summary;
    }

    return `Preparati a immergerti tra le pagine di ${book?.title || 'questo libro'}. Un progetto costruito per offrire una lettura coinvolgente, coerente e curata in ogni dettaglio.`;
};

const fetchRemoteBuffer = async (url) => {
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch remote asset: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
};


// --- EPUB EXPORT ENDPOINT ---

app.post("/export/epub", async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const Epub = require("epub-gen-memory").default || require("epub-gen-memory"); // Lazy load

        const { marked } = await import("marked");
        const { scopedSupabase } = await createScopedSupabaseForRequest(req);
        const { book, chapters, prompts } = await loadExportBundle(scopedSupabase, bookId);

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "Autore";
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

            // Build semantic HTML content
            let chapterHtml = `<div lang="it"><h1>${fullTitle}</h1>`;

            if (ch.exportCompiledContent) {
                chapterHtml += `<div class="chapter-content">${marked.parse(normalizeText(removeEmojis(ch.exportCompiledContent)))}</div>`;
            }

            ch.exportParagraphs.forEach(p => {
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
    const { bookId, edition = 'ebook' } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const docx = require("docx"); // Lazy load

        const { marked } = await import("marked");
        const normalizedEdition = edition === 'paperback' ? 'paperback' : 'ebook';
        const { scopedSupabase } = await createScopedSupabaseForRequest(req);
        const { book, chapters, prompts } = await loadExportBundle(scopedSupabase, bookId);


        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "W4U Writing Wizard";
        const publisher = "W4U";
        const docxDisclaimer = prompts['courtesy_disclaimer'] || "Tutti i diritti sono riservati...";
        const docxDesc = book.plot_summary ? (book.plot_summary.substring(0, 300) + "...") : "Un libro scritto con W4U";
        const backCoverBlurb = getBackCoverBlurb(book);

        let coverBuffer = null;
        if (normalizedEdition === 'paperback') {
            if (!book.cover_url) {
                throw new Error("Paperback export requires a book cover. Please generate one first.");
            }
            try {
                coverBuffer = await fetchRemoteBuffer(book.cover_url);
            } catch (err) {
                throw new Error("Failed to download book cover for paperback export. Please check the cover image or retry.");
            }
        }

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            Header, Footer, PageNumber, convertInchesToTwip,
            InternalHyperlink, ImageRun } = docx;

        const processedChapters = chapters.map((ch, index) => {
            const rawTitle = ch.title || "Senza titolo";
            const fullTitle = formatChapterTitle(index, rawTitle);

            const introHtml = ch.exportCompiledContent ? marked.parse(normalizeText(removeEmojis(ch.exportCompiledContent))) : "";
            const subchapters = ch.exportParagraphs.map(p => ({
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

        if (normalizedEdition === 'paperback' && coverBuffer) {
            children.push(
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: coverBuffer,
                            transformation: { width: 500, height: 750 }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }),
                new Paragraph({ text: "", pageBreakBefore: true }),
                new Paragraph({ text: "", pageBreakBefore: true })
            );
        }

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
            new Paragraph({ text: "", pageBreakBefore: true })
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

        if (normalizedEdition === 'paperback') {
            children.push(
                new Paragraph({
                    text: "Quarta di Copertina",
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                }),
                new Paragraph({
                    text: backCoverBlurb,
                    alignment: AlignmentType.BOTH,
                    spacing: { line: 360, after: 400 }
                }),
                new Paragraph({
                    text: `${cleanAuthor}`,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 600, after: 300 }
                }),
                new Paragraph({
                    text: "AREA BARCODE",
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 1000 }
                })
            );
        }

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
                    default: normalizedEdition === 'paperback'
                        ? new Footer({
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
                        : undefined
                },
                children: children
            }]
        });

        const exportUuid = uuidv4();
        const outputPath = getTempPath(`export_${bookId}_${exportUuid}.docx`);

        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        const fileSuffix = normalizedEdition === 'paperback' ? 'cartaceo' : 'ebook';
        res.download(outputPath, `${cleanBookTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${fileSuffix}.docx`, (err) => {
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
    const { bookId, edition = 'ebook' } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    try {
        const { marked } = await import("marked");

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


        const normalizedEdition = edition === 'paperback' ? 'paperback' : 'ebook';
        if (normalizedEdition !== 'ebook') {
            return res.status(400).json({ error: "PDF export is available only for ebook edition" });
        }

        const { scopedSupabase } = await createScopedSupabaseForRequest(req);
        const { book, chapters, prompts } = await loadExportBundle(scopedSupabase, bookId);

        const cleanBookTitle = editorialCasing(normalizeText(removeEmojis(book.title || "Libro")));
        const cleanAuthor = book.author || "Autore";
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
                .cover-page { page-break-after: always; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                .cover-page img { width: 100%; max-height: 100vh; object-fit: contain; }
                .title-page { text-align: center; margin-top: 18%; page-break-after: always; }
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
            ${book.cover_url ? `
            <div class="cover-page">
                <img src="${book.cover_url}" alt="Copertina frontale" />
            </div>` : ''}
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
            let chapterHtml = `
                <div class="chapter" id="ch${i + 1}">
                    <h1 class="chapter-title">${fullTitle}</h1>
                    <div class="content">`;

            if (ch.exportCompiledContent) {
                chapterHtml += `<div class="chapter-intro">${marked.parse(normalizeText(removeEmojis(ch.exportCompiledContent)))}</div>`;
            }

            ch.exportParagraphs.forEach(p => {
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
            displayHeaderFooter: false,
            margin: { top: '2cm', bottom: '2cm', right: '2cm', left: '2cm' },
            printBackground: true
        });

        await browser.close();

        res.download(outputPath, `libro_${bookId}_ebook.pdf`, (err) => {
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

/**
 * POST /api/book-generation/start
 * Creates a backend-orchestrated book generation run.
 */
app.post("/api/book-generation/start", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }

        const token = authHeader.substring(7);
        const scopedSupabase = createScopedSupabaseFromToken(token);

        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        const { bookId } = req.body;
        if (!bookId) {
            return res.status(400).json({ error: "Missing 'bookId' parameter" });
        }

        const { data: book, error: bookError } = await scopedSupabase
            .from('books')
            .select('id, title, status, target_pages, target_chapters, context_data, configuration')
            .eq('id', bookId)
            .single();

        if (bookError || !book) {
            return res.status(404).json({ error: "Book not found or access denied" });
        }

        const { count: chaptersCount, error: chaptersCountError } = await scopedSupabase
            .from('chapters')
            .select('id', { count: 'exact', head: true })
            .eq('book_id', bookId);

        if (chaptersCountError) {
            console.error('[Book Generation] Failed to count chapters:', chaptersCountError.message);
            return res.status(500).json({ error: 'Failed to inspect book chapters' });
        }

        const activeStatuses = ['pending', 'planning', 'writing', 'review'];
        const { data: existingRun, error: existingRunError } = await scopedSupabase
            .from('book_generation_runs')
            .select('id, status, phase, updated_at')
            .eq('book_id', bookId)
            .in('status', activeStatuses)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingRunError) {
            console.error('[Book Generation] Failed to check existing run:', existingRunError.message);
            const message = /book_generation_runs|relation|404/i.test(existingRunError.message || '')
                ? 'Database schema incomplete: missing table book_generation_runs. Apply the latest Supabase migration before starting generation.'
                : 'Failed to check active runs';
            return res.status(500).json({ error: message });
        }

        if (existingRun) {
            const updatedAt = new Date(existingRun.updated_at);
            const now = new Date();
            const minutesSinceUpdate = (now - updatedAt) / (1000 * 60);

            // If run is stale (no update for 15 min), allow bypassing it
            if (minutesSinceUpdate > 15 || req.body.force === true) {
                console.log(`[Book Generation] Run ${existingRun.id} is stale (${minutesSinceUpdate.toFixed(1)} min). Marking as failed and starting new run.`);
                await supabase.from('book_generation_runs')
                    .update({
                        status: 'failed',
                        last_error: req.body.force ? 'Manually terminated' : 'Stale/Abandoned Run',
                        updated_at: now.toISOString()
                    })
                    .eq('id', existingRun.id);
            } else {
                return res.status(409).json({
                    error: 'A generation run is already active for this book',
                    runId: existingRun.id,
                    status: existingRun.status,
                    phase: existingRun.phase,
                    last_update: existingRun.updated_at
                });
            }
        }

        const targetPages = Number(book?.target_pages || book?.context_data?.target_pages);
        if (!Number.isFinite(targetPages) || targetPages <= 0) {
            return res.status(400).json({ error: 'Book is missing a valid target_pages value' });
        }

        const targetTotalWords = Math.round(targetPages * getWordsPerPage(book));

        const { data: run, error: runInsertError } = await scopedSupabase
            .from('book_generation_runs')
            .insert({
                book_id: bookId,
                created_by: user.id,
                status: 'pending',
                phase: 'outline',
                target_total_words: targetTotalWords,
                expected_chapters: Number.isFinite(Number(book?.target_chapters)) ? Number(book.target_chapters) : null,
                metadata: {
                    source: 'api/book-generation/start',
                    book_status: book.status || null
                }
            })
            .select()
            .single();

        if (runInsertError || !run) {
            console.error('[Book Generation] Failed to create run:', runInsertError?.message);
            return res.status(500).json({ error: 'Failed to create generation run' });
        }

        res.json({
            status: 'started',
            runId: run.id
        });

        kickBookGenerationRun(run.id, 'start_endpoint');
    } catch (err) {
        console.error('[Book Generation] Start error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/book-generation/status/:runId
 * Returns orchestrator run state.
 */
app.get("/api/book-generation/status/:runId", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split('Bearer ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const scopedSupabase = createScopedSupabaseFromToken(token);
        const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const runId = req.params.runId;
        const { data: run, error } = await scopedSupabase
            .from('book_generation_runs')
            .select('*')
            .eq('id', runId)
            .single();

        if (error || !run) {
            return res.status(404).json({ error: 'Run not found' });
        }

        const isActiveRun = ['pending', 'planning', 'writing', 'review'].includes(run.status);
        if (isActiveRun && run.updated_at) {
            const updatedAt = new Date(run.updated_at).getTime();
            const now = Date.now();
            const secondsSinceUpdate = Number.isFinite(updatedAt) ? (now - updatedAt) / 1000 : 0;

            // Vercel may suspend background work after the initial response.
            // Use status polling as a safe heartbeat to re-kick stalled active runs.
            if (secondsSinceUpdate >= 15) {
                kickBookGenerationRun(run.id, `status_poll_${run.phase}`);
            }
        }

        res.json({
            id: run.id,
            status: run.status,
            phase: run.phase,
            book_id: run.book_id,
            current_chapter_id: run.current_chapter_id,
            current_chapter_number: run.current_chapter_number,
            target_total_words: run.target_total_words,
            actual_total_words: run.actual_total_words,
            expected_chapters: run.expected_chapters,
            completed_chapters: run.completed_chapters,
            last_error: run.last_error,
            metadata: run.metadata,
            created_at: run.created_at,
            updated_at: run.updated_at
        });
    } catch (err) {
        console.error('[Book Generation] Status error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- AI AGENT PROXY (ASYNC WITH POLLING) ---

/**
 * Async helper to forward requests to n8n in the background.
 * Updates ai_requests table with results when complete.
 */
async function forwardToN8n(requestId, userId, payload, token) {
    const bookId = payload.bookId;
    await logDebug('server', 'ai_proxy_start', { requestId, action: payload.action, payload: { ...payload, token: 'REDACTED' } }, bookId);

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

        const n8nPayload = {
            ...payload,
            userId,
            requestId,
            serverUrl: payload.serverUrl, // Pass serverUrl through to n8n
            temperature: payload.temperature ?? 0.2
        };

        console.log(`[AI Proxy Debug] Payload for n8n:`, JSON.stringify(n8nPayload));

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
        await logDebug('server', 'ai_proxy_dispatch', {
            requestId,
            action: payload.action,
            webhook: n8nWebhookUrl
        }, bookId);

        const timeoutMs = Number(process.env.N8N_REQUEST_TIMEOUT_MS || 300000);
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        let n8nResponse;
        try {
            n8nResponse = await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: n8nHeaders,
                body: JSON.stringify(n8nPayload),
                signal: controller.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') {
                await logDebug('server', 'ai_proxy_dispatch_timeout', {
                    requestId,
                    action: payload.action,
                    webhook: n8nWebhookUrl,
                    timeout_ms: timeoutMs
                }, bookId);
                throw new Error(`Timeout connecting to n8n after ${timeoutMs}ms`);
            }

            await logDebug('server', 'ai_proxy_fetch_error', {
                requestId,
                action: payload.action,
                webhook: n8nWebhookUrl,
                error: err?.message || String(err)
            }, bookId);
            console.error(`[AI Proxy] Fetch to n8n failed for ${requestId}:`, err.message);
            throw new Error(`Network error connecting to n8n: ${err.message}`);
        } finally {
            clearTimeout(timeoutHandle);
        }

        await logDebug('server', 'ai_proxy_n8n_response', {
            requestId,
            status: n8nResponse.status,
            statusText: n8nResponse.statusText
        }, bookId);

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
                    if (payload.action === 'WRITE_CHAPTER_FROM_PLAN') {
                        throw new Error('WRITE_CHAPTER_FROM_PLAN returned async status. Expected synchronous completion.');
                    }
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

        // Detect serverUrl from request headers or fall back to defined env
        const serverUrl = process.env.VITE_APP_URL || process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

        // Return immediately with requestId
        res.json({
            status: 'pending',
            requestId: aiRequest.id,
            message: 'Request queued for processing',
            serverUrl // Optional: let frontend know too if needed
        });

        // Forward to n8n asynchronously (don't await)
        // Pass the token so `forwardToN8n` can also create a scoped client to update the record
        const finalPayload = { ...req.body, serverUrl };
        console.log(`[AI Proxy Debug] Dispatching ${action} for book ${bookId}. serverUrl: ${serverUrl}`);
        forwardToN8n(aiRequest.id, user.id, finalPayload, token).catch(err => {
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
        let { bookId, imageUrl } = req.body || {};

        // Handle n8n common errors: trailing space in key or leading '=' in values
        if (!bookId && req.body && req.body["bookId "]) bookId = req.body["bookId "];

        if (typeof bookId === 'string') bookId = bookId.replace(/^=/, '').trim();
        if (typeof imageUrl === 'string') imageUrl = imageUrl.replace(/^=/, '').trim();

        let file = req.file;

        // Diagnostic log
        console.log(`[Upload] Request for book ${bookId}. File: ${!!file}, URL: ${!!imageUrl}`);

        // If no file but URL is provided, download it
        if (!file && imageUrl) {
            try {
                console.log(`[Upload] Downloading image from URL: ${imageUrl.substring(0, 50)}...`);

                const response = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (W4U-Writing-Wizard/1.0)'
                    }
                });

                if (!response.ok) {
                    throw new Error(`OpenAI respond con status ${response.status}: ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                file = {
                    buffer: buffer,
                    size: buffer.length,
                    mimetype: response.headers.get('content-type') || 'image/png',
                    originalname: 'image.png'
                };
            } catch (fetchErr) {
                console.error("[Upload] Error fetching image from URL:", fetchErr);
                return res.status(400).json({
                    error: "Failed to download image from the provided URL",
                    details: fetchErr.message
                });
            }
        }

        // Diagnostic log to DB
        await logDebug('server', 'upload_debug', {
            body: req.body,
            fileExists: !!file,
            fileSize: file?.size,
            headers: req.headers
        }, bookId || null);

        if (!bookId || !file) {
            const missing = [];
            if (!bookId) missing.push("bookId");
            if (!file) missing.push("image file or imageUrl");

            console.error("[Upload] Missing data:", missing.join(", "));
            return res.status(400).json({
                error: `Missing parameters: ${missing.join(", ")}`,
                debug: { bodyReceived: !!req.body, fileReceived: !!file, urlReceived: !!imageUrl }
            });
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
