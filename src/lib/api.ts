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
export const callWithRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
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
export const callBookAgent = async (action: string, body: any, bookId?: string | null) => {
    const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

    const requestPayload = {
        action,
        bookId,
        ...body
    };

    // Wrappa la chiamata nel retry logic
    return callWithRetry(async () => {
        // Log ad ogni tentativo (utile per vedere nel DB quanti retry sono serviti)
        console.log(`[API] Calling n8n [${action}]:`, requestPayload);
        await logDebug('frontend', `n8n_request_${action.toLowerCase()}`, {
            url: WEBHOOK_URL,
            attempt: 'retry_active',
            ...requestPayload
        }, bookId);

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[API] n8n Error ${response.status}:`, errorText);
                await logDebug('frontend', `n8n_http_error_${action.toLowerCase()}`, {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                }, bookId);
                throw new Error(`N8N Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Log successo
            await logDebug('frontend', `n8n_success_${action.toLowerCase()}`, data, bookId);

            return data;

        } catch (err: any) {
            // Log errore di rete/exception per questo tentativo specifico
            await logDebug('frontend', `n8n_exception_${action.toLowerCase()}`, {
                message: err.message,
                type: err.name || 'Error'
            }, bookId);
            throw err; // Rilancia per permettere a callWithRetry di ritentare o fallire definitivamente
        }
    }, 3); // 3 tentativi totali
};

export { supabase };