import { createClient } from '@supabase/supabase-js';

// ─── ENV Validation ────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[API] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
} else {
    console.log('[API] Supabase initialized:', SUPABASE_URL);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Centralized logger
export const logDebug = async (source: string, eventType: string, payload: any, bookId?: string | null) => {
    try {
        await supabase.from('debug_logs').insert({
            source,
            event_type: eventType,
            payload,
            book_id: bookId || null
        });
    } catch (e: unknown) {
        console.error("Failed to log to DB:", e);
    }
};

// Retry helper with linear backoff (1s, 2s, 3s)
export const callWithRetry = async <T>(fn: (attempt: number) => Promise<T>, retries = 3): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < retries; i++) {
        try {
            return await fn(i);
        } catch (err) {
            lastError = err;
            if (i === retries - 1) break; // Ultimo tentativo fallito, usciamo
            // Backoff crescente: attende 1s, poi 2s, poi 3s...
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    throw lastError;
};

// Get current auth headers for Proxy calls
const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
    } catch (err: unknown) {
        console.error('[API] getAuthHeaders: failed to get session');
    }

    return headers;
};

// Wrapper for Proxy calls with automatic retry logic
export const callBookAgent = async (action: string, body: any, bookId?: string | null) => {
    // Forward to our local API proxy
    const PROXY_URL = '/api/ai-agent';

    const requestPayload = {
        action,
        bookId,
        ...body
    };

    return callWithRetry(async (attempt) => {
        const startTime = performance.now();
        const attemptLabel = `attempt_${attempt + 1}`;

        console.log(`[API] Calling Proxy [${action}] (${attemptLabel}):`, requestPayload);
        await logDebug('frontend', `ai_request_${action.toLowerCase()}`, {
            action,
            bookId,
            attempt: attemptLabel,
            ...body
        }, bookId);

        try {
            const authHeaders = await getAuthHeaders();

            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(requestPayload)
            });

            const duration = Math.round(performance.now() - startTime);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[API] AI Service Error ${response.status}:`, errorText);
                await logDebug('frontend', `ai_http_error_${action.toLowerCase()}`, {
                    status: response.status,
                    statusText: response.statusText,
                    duration_ms: duration,
                    attempt: attemptLabel,
                    body: errorText
                }, bookId);
                throw new Error(`AI Service Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            await logDebug('frontend', `ai_success_${action.toLowerCase()}`, {
                ...data,
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);

            return data;

        } catch (err: unknown) {
            const error = err as Error;
            const duration = Math.round(performance.now() - startTime);
            await logDebug('frontend', `ai_exception_${action.toLowerCase()}`, {
                message: error.message,
                type: (error as any).name || 'Error',
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);
            throw error;
        }
    }, 3);
};

export { supabase };