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

// Wrapper for n8n API calls
export const callBookAgent = async (action: string, body: any, bookId?: string | null) => {
    const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

    const requestPayload = {
        action,
        bookId,
        ...body
    };

    // 1. Log outgoing request
    console.log(`[API] Calling n8n: ${WEBHOOK_URL}`, requestPayload);
    await logDebug('frontend', `n8n_request_${action.toLowerCase()}`, { url: WEBHOOK_URL, ...requestPayload }, bookId);

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API] n8n Error ${response.status}:`, errorText);
            await logDebug('frontend', `n8n_error_${action.toLowerCase()}`, { status: response.status, statusText: response.statusText, body: errorText, url: WEBHOOK_URL }, bookId);
            throw new Error(`N8N Error: ${response.statusText}`);
        }

        const data = await response.json();

        // 2. Log incoming response
        await logDebug('frontend', `n8n_response_${action.toLowerCase()}`, data, bookId);

        return data;

    } catch (err: any) {
        await logDebug('frontend', `n8n_exception_${action.toLowerCase()}`, { message: err.message }, bookId);
        throw err;
    }
};

export { supabase };
