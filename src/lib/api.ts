import { createClient } from '@supabase/supabase-js';

// ─── ENV Validation ────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[API] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authTokenCache: string | null = null;

const getSupabaseStorageKey = (): string | null => {
    try {
        const host = new URL(SUPABASE_URL).host;
        const projectRef = host.split('.')[0];
        return projectRef ? `sb-${projectRef}-auth-token` : null;
    } catch {
        return null;
    }
};

const readAccessTokenFromStorage = (): string | null => {
    if (typeof window === 'undefined') return null;

    const storageKey = getSupabaseStorageKey();
    if (!storageKey) return null;

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
        if (Array.isArray(parsed)) {
            const sessionLike = parsed.find((entry: any) => entry?.access_token || entry?.currentSession?.access_token);
            if (sessionLike?.access_token) return sessionLike.access_token;
            if (sessionLike?.currentSession?.access_token) return sessionLike.currentSession.access_token;
        }
    } catch (error) {
        console.warn('[API] Failed to read auth token from localStorage:', error);
    }

    return null;
};

supabase.auth.onAuthStateChange((_event, session) => {
    authTokenCache = session?.access_token ?? null;
});

/**
 * Handles irrecoverable authentication errors (like 400 Refresh Token Not Found).
 * It marks the session as invalid and redirects to login if necessary.
 */
const handleAuthError = async (error: any) => {
    const isInvalidRefreshToken = error?.message?.includes('Refresh Token Not Found') ||
                                 error?.status === 400 ||
                                 error?.code === 'refresh_token_not_found';

    if (isInvalidRefreshToken) {
        console.warn('[API] Irrecoverable auth error detected. Clearing session.');
        authTokenCache = null;
        await supabase.auth.signOut();
        // Force a page reload or redirect to login to ensure clean state
        if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=session_expired';
        }
    }
};

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
            if (i === retries - 1) break;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    throw lastError;
};

// Get current auth headers for Proxy calls
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            authTokenCache = session.access_token;
            headers['Authorization'] = `Bearer ${session.access_token}`;
            return headers;
        }
    } catch (err: unknown) {
        console.error('[API] getAuthHeaders: failed to get session');
    }

    const fallbackToken = authTokenCache || readAccessTokenFromStorage();
    if (fallbackToken) {
        authTokenCache = fallbackToken;
        headers['Authorization'] = `Bearer ${fallbackToken}`;
    }

    return headers;
};

/**
 * Poll for async AI request completion
 */
export const pollForCompletion = async (requestId: string, bookId?: string | null, maxAttempts = 300): Promise<any> => {
    const POLL_INTERVAL = import.meta.env.NODE_ENV === 'test' ? 1 : 2000;

    let attempt = 0;
    while (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        try {
            const currentHeaders = await getAuthHeaders();
            const statusResponse = await fetch(`/api/ai-agent/status/${requestId}`, {
                method: 'GET',
                headers: currentHeaders
            });

            if (!statusResponse.ok) {
                if (statusResponse.status === 401) {
                    try {
                        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
                        if (refreshError || !session?.access_token) {
                            await handleAuthError(refreshError || new Error('Session expired'));
                            throw new Error('Session expired: please log in again');
                        }
                        authTokenCache = session.access_token;
                        continue; 
                    } catch (err: any) {
                        await handleAuthError(err);
                        throw new Error('Session invalid: please log in again');
                    }
                }
                attempt++;
                continue;
            }

            const statusData = await statusResponse.json();

            if (statusData.status === 'completed') {
                await logDebug('frontend', 'ai_request_completed', { requestId, attempt, duration_ms: attempt * POLL_INTERVAL }, bookId);
                return statusData.data;
            }

            if (statusData.status === 'failed') {
                await logDebug('frontend', 'ai_request_failed', { requestId, error: statusData.error, attempt }, bookId);
                throw new Error(statusData.error || 'Request failed');
            }

            if (attempt % 5 === 0 && attempt > 0) {
                await logDebug('frontend', 'polling_progress', { requestId, attempt, status: statusData.status }, bookId);
            }
            
            attempt++;
        } catch (error: any) {
            if (error.message?.includes('Session invalid') || error.message?.includes('Session expired')) {
                throw error;
            }
            if (attempt >= maxAttempts - 1) throw error;
            attempt++;
        }
    }

    throw new Error('Request timeout: Max polling attempts exceeded');
};

// Wrapper for Proxy calls with automatic retry logic
export const callBookAgent = async (action: string, body: any, bookId?: string | null) => {
    const PROXY_URL = '/api/ai-agent';
    const authHeaders = await getAuthHeaders();

    const requestPayload = {
        action,
        bookId: bookId || body.bookId,
        ...body
    };

    await logDebug('frontend', `ai_request_${action}`, requestPayload, bookId);

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            await logDebug('frontend', `ai_http_error_${action}`, {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            }, bookId);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const initialData = await response.json();

        if (initialData.status === 'completed') {
            await logDebug('frontend', `ai_immediate_response_${action}`, { requestId: initialData.requestId }, bookId);
            return initialData.data;
        }

        if (!initialData.requestId) {
            throw new Error('No requestId received from server');
        }

        await logDebug('frontend', `ai_polling_start_${action}`, {
            requestId: initialData.requestId
        }, bookId);

        return await pollForCompletion(initialData.requestId, bookId);

    } catch (error: any) {
        await logDebug('frontend', `ai_exception_${action}`, {
            type: error.constructor?.name,
            message: error.message
        }, bookId);
        throw error;
    }
};

export interface BookGenerationRunStatus {
    id: string;
    book_id: string;
    status: 'pending' | 'planning' | 'writing' | 'review' | 'completed' | 'failed';
    phase: 'outline' | 'scaffold' | 'write_chapter' | 'final_review';
    current_chapter_id: string | null;
    current_chapter_number: number | null;
    target_total_words: number;
    actual_total_words: number;
    expected_chapters: number | null;
    completed_chapters: number | null;
    last_error: string | null;
    user_message?: string | null;
    developer_message?: string | null;
    suggested_action?: string | null;
    recoverable?: boolean | null;
    fallback_info?: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export const startBookGeneration = async (bookId: string): Promise<{ runId: string; status: string }> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch('/api/book-generation/start', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ bookId })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload?.error || 'Failed to start book generation') as Error & {
            runId?: string;
            status?: string;
            phase?: string;
        };

        if (payload?.runId) error.runId = payload.runId;
        if (payload?.status) error.status = payload.status;
        if (payload?.phase) error.phase = payload.phase;
        throw error;
    }

    return payload;
};

export const getBookGenerationStatus = async (runId: string): Promise<BookGenerationRunStatus> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`/api/book-generation/status/${runId}`, {
        method: 'GET',
        headers: authHeaders
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch book generation status');
    }

    return payload as BookGenerationRunStatus;
};
