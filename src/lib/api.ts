import { createClient } from '@supabase/supabase-js';

// ─── ENV Validation ────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[API] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
} else {
    console.log('[API] Supabase initialized:', SUPABASE_URL);
}

// NOTE: n8n credentials (N8N_API_KEY, N8N_WEBHOOK_SECRET) are now server-side only
// They should NOT be prefixed with VITE_ and will not be accessible from the client

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Centralized logger
export const logDebug = async (source: string, eventType: string, payload: unknown, bookId?: string | null) => {
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
    let lastError: unknown;

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
    } catch (err: unknown) {
        const error = err as Error;
        console.error('[API] getAuthHeaders: CRASH getting session:', error.message);
        // Don't block the request — proceed without JWT
    }

    // NOTE: n8n credentials are now handled server-side by the proxy
    // No need to expose VITE_N8N_API_KEY or VITE_WEBHOOK_SECRET here

    return headers;
};

// Wrapper for n8n API calls with automatic retry logic
// NOW USES SECURE PROXY: /api/ai-agent instead of direct n8n webhook
export const callBookAgent = async (action: string, body: Record<string, unknown>, bookId?: string | null) => {
    // Use the secure proxy endpoint
    const PROXY_URL = '/api/ai-agent';

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
        console.log(`[API] Calling AI Agent [${action}] via proxy (${attemptLabel}):`, requestPayload);
        await logDebug('frontend', `ai_request_${action.toLowerCase()}`, {
            attempt: attemptLabel,
            ...requestPayload
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
                console.error(`[API] Proxy Error ${response.status}:`, errorText);
                await logDebug('frontend', `ai_http_error_${action.toLowerCase()}`, {
                    status: response.status,
                    statusText: response.statusText,
                    duration_ms: duration,
                    attempt: attemptLabel,
                    body: errorText
                }, bookId);
                throw new Error(`AI Service Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Log successo
            await logDebug('frontend', `ai_success_${action.toLowerCase()}`, {
                ...data,
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);

            return data;

        } catch (err: unknown) {
            const error = err as Error;
            const duration = Math.round(performance.now() - startTime);
            // Log errore di rete/exception per questo tentativo specifico
            await logDebug('frontend', `ai_exception_${action.toLowerCase()}`, {
                message: error.message,
                type: error.name || 'Error',
                duration_ms: duration,
                attempt: attemptLabel
            }, bookId);
            throw error;
        }
    }, 3); // 3 tentativi totali
};

export { supabase };