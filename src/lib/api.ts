import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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