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

/**
 * Poll for async AI request completion
 */
async function pollForCompletion(
    requestId: string,
    headers: any,
    bookId?: string | null,
    maxAttempts = 60
): Promise<any> {
    const POLL_INTERVAL = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        try {
            const statusResponse = await fetch(`/api/ai-agent/status/${requestId}`, { method: 'GET', headers });

            if (!statusResponse.ok) {
                logDebug('frontend', 'polling_error', { requestId, attempt, status: statusResponse.status }, bookId);
                if (statusResponse.status === 404) throw new Error('Request not found');
                continue; // Retry on other errors
            }

            const statusData = await statusResponse.json();

            if (statusData.status === 'completed') {
                logDebug('frontend', 'ai_request_completed', { requestId, attempt, duration_ms: attempt * POLL_INTERVAL }, bookId);
                return statusData.data;
            }

            if (statusData.status === 'failed') {
                logDebug('frontend', 'ai_request_failed', { requestId, error: statusData.error, attempt }, bookId);
                throw new Error(statusData.error || 'Request failed');
            }

            // Still processing, continue polling
            if (attempt % 10 === 0 && attempt > 0) {
                logDebug('frontend', 'polling_progress', { requestId, attempt, status: statusData.status }, bookId);
            }
        } catch (error) {
            if (attempt === maxAttempts - 1) throw error;
        }
    }

    throw new Error('Request timeout: Max polling attempts exceeded (2 minutes)');
}

// Wrapper for Proxy calls with automatic retry logic
export const callBookAgent = async (action: string, body: any, bookId?: string | null) => {
    // Forward to our local API proxy
    const PROXY_URL = '/api/ai-agent';

    const authHeaders = await getAuthHeaders();

    const requestPayload = {
        action,
        bookId: bookId || body.bookId,
        ...body
    };

    logDebug('frontend', `ai_request_${action}`, requestPayload, bookId);

    try {
        // Step 1: Initiate async request
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logDebug('frontend', `ai_http_error_${action}`, {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            }, bookId);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const initialData = await response.json();

        if (initialData.status === 'completed') {
            // Immediate response (unlikely but possible for cached/fast operations)
            logDebug('frontend', `ai_immediate_response_${action}`, { requestId: initialData.requestId }, bookId);
            return initialData.data;
        }

        if (!initialData.requestId) {
            throw new Error('No requestId received from server');
        }

        logDebug('frontend', `ai_polling_start_${action}`, {
            requestId: initialData.requestId
        }, bookId);

        // Step 2: Poll for completion
        const result = await pollForCompletion(initialData.requestId, authHeaders, bookId);

        return result;

    } catch (error: any) {
        logDebug('frontend', `ai_exception_${action}`, {
            type: error.constructor?.name,
            message: error.message
        }, bookId);
        throw error;
    }
};

export { supabase };