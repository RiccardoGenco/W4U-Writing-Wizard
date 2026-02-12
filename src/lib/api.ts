import { createClient } from '@supabase/supabase-js';

// ─── ENV Validation ────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const N8N_API_KEY = import.meta.env.VITE_N8N_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[API] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
} else {
    console.log('[API] Supabase initialized:', SUPABASE_URL);
}

if (!N8N_API_KEY) {
    console.warn('[API] VITE_N8N_API_KEY not set — n8n calls will rely on JWT only');
} else {
    console.log('[API] N8N API Key configured');
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
    } catch (e) {
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

// Get current auth headers for n8n calls
const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    try {
        // Add JWT token from Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('[API] getAuthHeaders: failed to get session:', error.message);
        } else if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
            console.log('[API] getAuthHeaders: JWT attached (expires:', new Date((session.expires_at || 0) * 1000).toISOString(), ')');
        } else {
            console.warn('[API] getAuthHeaders: no active session — request will be unauthenticated');
        }
    } catch (err: any) {
        console.error('[API] getAuthHeaders: CRASH getting session:', err.message);
        // Don't block the request — proceed without JWT
    }

    // Add API key if configured
    if (N8N_API_KEY) {
        headers['X-API-Key'] = N8N_API_KEY;
    }

    return headers;
};

// Wrapper for n8n API calls with automatic retry logic
export const callBookAgent = async (action: string, body: any, bookId?: string | null, customPath?: string) => {
    let WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

    // If a custom path is provided, construct the URL based on the same base
    if (customPath) {
        const baseUrl = WEBHOOK_URL.split('/webhook/')[0];
        WEBHOOK_URL = `${baseUrl}/webhook/${customPath}`;
    }

    const requestPayload = {
        action,
        bookId,
        ...body
    };

    // Wrappa la chiamata nel retry logic
    return callWithRetry(async (attempt) => {
        const startTime = performance.now();
        const attemptLabel = `attempt_${attempt + 1}`;

        // Log ad ogni tentativo
        console.log(`[API] Calling n8n [${action}] on ${WEBHOOK_URL} (${attemptLabel}):`, requestPayload);
        await logDebug('frontend', `n8n_request_${action.toLowerCase()}`, {
            url: WEBHOOK_URL,
            attempt: attemptLabel,
            ...requestPayload
        }, bookId);

        try {
            const authHeaders = await getAuthHeaders();

            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(requestPayload)
            });

            const duration = Math.round(performance.now() - startTime);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[API] n8n Error ${response.status}:`, errorText);
                await logDebug('frontend', `n8n_http_error_${action.toLowerCase()}`, {
                    status: response.status,
                    statusText: response.statusText,
                    duration_ms: duration,
                    attempt: attemptLabel,
                    body: errorText
                }, bookId);
                throw new Error(`N8N Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Log successo
            await logDebug('frontend', `n8n_success_${action.toLowerCase()}`, {
                ...data,
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);

            return data;

        } catch (err: any) {
            const duration = Math.round(performance.now() - startTime);
            // Log errore di rete/exception per questo tentativo specifico
            await logDebug('frontend', `n8n_exception_${action.toLowerCase()}`, {
                message: err.message,
                type: err.name || 'Error',
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);
            throw err;
        }
    }, 3); // 3 tentativi totali
};

export { supabase };