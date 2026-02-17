import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, logDebug } from './api';
import type { User, Session, AuthError } from '@supabase/supabase-js';

// ─── Error Translation Map ────────────────────────────────────────────────────
// Supabase returns English error messages. We translate the most common ones
// so the user sees something meaningful in Italian.
const ERROR_MAP: Record<string, string> = {
    'Invalid login credentials': 'Email o password non corretti',
    'Email not confirmed': 'Email non ancora confermata. Controlla la tua casella di posta.',
    'User already registered': 'Questa email è già registrata. Prova ad accedere.',
    'Password should be at least 6 characters': 'La password deve essere di almeno 6 caratteri',
    'Signup requires a valid password': 'Inserisci una password valida',
    'Unable to validate email address: invalid format': 'Formato email non valido',
    'Email rate limit exceeded': 'Troppi tentativi. Riprova tra qualche minuto.',
    'For security purposes, you can only request this after': 'Troppi tentativi. Attendi qualche secondo e riprova.',
    'Network error': 'Errore di connessione. Controlla la tua connessione internet.',
};

/**
 * Translate a Supabase auth error to a user-friendly Italian message.
 * Falls back to the original message if no translation is found,
 * but wraps completely unknown errors in a generic message.
 */
const translateError = (error: AuthError | Error | string): string => {
    const rawMessage = typeof error === 'string' ? error : error.message;
    console.warn('[Auth] Raw error from Supabase:', rawMessage);

    // Check for exact matches
    if (ERROR_MAP[rawMessage]) return ERROR_MAP[rawMessage];

    // Check for partial matches (some Supabase errors have variable suffixes)
    for (const [key, translation] of Object.entries(ERROR_MAP)) {
        if (rawMessage.toLowerCase().includes(key.toLowerCase())) {
            return translation;
        }
    }

    // Fallback: don't expose raw technical errors to the user
    console.error('[Auth] Untranslated error:', rawMessage);
    return 'Si è verificato un errore. Riprova più tardi.';
};

// ─── Auth Context ──────────────────────────────────────────────────────────────

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    authError: string | null;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string, authorName?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
    signOut: () => Promise<void>;
    clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Auth Provider ─────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    const clearAuthError = useCallback(() => setAuthError(null), []);

    useEffect(() => {
        console.log('[Auth] Initializing AuthProvider — fetching session...');
        const startTime = performance.now();

        // Get initial session with error handling
        supabase.auth.getSession()
            .then(({ data: { session }, error }) => {
                const duration = Math.round(performance.now() - startTime);

                if (error) {
                    console.error(`[Auth] getSession failed (${duration}ms):`, error.message);
                    logDebug('auth', 'session_init_error', {
                        error: error.message,
                        duration_ms: duration
                    });
                    // Don't block the app — just let the user see login
                    setLoading(false);
                    return;
                }

                if (session) {
                    console.log(`[Auth] Session restored (${duration}ms) — user:`, session.user.email);
                    logDebug('auth', 'session_restored', {
                        email: session.user.email,
                        expires_at: session.expires_at,
                        duration_ms: duration
                    });
                } else {
                    console.log(`[Auth] No active session found (${duration}ms)`);
                    logDebug('auth', 'session_none', { duration_ms: duration });
                }

                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                // Network error or Supabase unreachable
                const duration = Math.round(performance.now() - startTime);
                const error = err as Error;
                console.error(`[Auth] getSession CRASHED (${duration}ms):`, error);
                logDebug('auth', 'session_init_crash', {
                    error: error.message,
                    duration_ms: duration
                });
                setLoading(false); // Fallback: don't block the app forever
            });

        // Listen for auth changes (PKCE flow handles token refresh automatically)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log(`[Auth] Auth state changed: event=${event}, user=${session?.user?.email ?? 'none'}`);
                logDebug('auth', 'state_change', {
                    event,
                    email: session?.user?.email,
                    has_session: !!session
                });

                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);

                // Handle specific events
                if (event === 'SIGNED_OUT') {
                    console.log('[Auth] User signed out — clearing local state');
                    setAuthError(null);
                } else if (event === 'SIGNED_IN') {
                    console.log('[Auth] User signed in — claiming legacy books...');
                    // Claim any unclaimed legacy books (user_id = NULL)
                    supabase.rpc('claim_legacy_books').then(({ data, error }) => {
                        if (error) {
                            console.warn('[Auth] claim_legacy_books failed:', error.message);
                            logDebug('auth', 'claim_legacy_books_error', {
                                error: error.message,
                                email: session?.user?.email
                            });
                        } else if (data && typeof data === 'number' && data > 0) {
                            console.log(`[Auth] Claimed ${data} legacy book(s)`);
                            logDebug('auth', 'legacy_books_claimed', {
                                claimed_count: data,
                                email: session?.user?.email
                            });
                        } else {
                            console.log('[Auth] No legacy books to claim');
                        }
                    });
                } else if (event === 'TOKEN_REFRESHED') {
                    console.log('[Auth] Token refreshed successfully');
                } else if (event === 'USER_UPDATED') {
                    console.log('[Auth] User profile updated');
                }
            }
        );

        return () => {
            console.log('[Auth] Cleaning up auth listener');
            subscription.unsubscribe();
        };
    }, []);

    // ─── Sign In ───────────────────────────────────────────────────────────────

    const signIn = async (email: string, password: string) => {
        console.log('[Auth] signIn attempt for:', email);
        const startTime = performance.now();

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            const duration = Math.round(performance.now() - startTime);

            if (error) {
                const translated = translateError(error);
                console.warn(`[Auth] signIn failed (${duration}ms):`, error.message, '→', translated);
                logDebug('auth', 'signin_failed', {
                    email,
                    error: error.message,
                    translated,
                    duration_ms: duration
                });
                setAuthError(translated);
                return { error: translated };
            }

            console.log(`[Auth] signIn SUCCESS (${duration}ms) for:`, email);
            logDebug('auth', 'signin_success', { email, duration_ms: duration });
            setAuthError(null);
            return { error: null };

        } catch (err: unknown) {
            const error = err as Error;
            const duration = Math.round(performance.now() - startTime);
            const translated = translateError(error);
            console.error(`[Auth] signIn CRASH (${duration}ms):`, error);
            logDebug('auth', 'signin_crash', {
                email,
                error: error.message,
                duration_ms: duration
            });
            setAuthError(translated);
            return { error: translated };
        }
    };

    // ─── Sign Up ───────────────────────────────────────────────────────────────

    const signUp = async (email: string, password: string, authorName?: string) => {
        console.log('[Auth] signUp attempt for:', email, 'author:', authorName || '(none)');
        const startTime = performance.now();

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        author_name: authorName || ''
                    }
                }
            });

            const duration = Math.round(performance.now() - startTime);

            if (error) {
                const translated = translateError(error);
                console.warn(`[Auth] signUp failed (${duration}ms):`, error.message, '→', translated);
                logDebug('auth', 'signup_failed', {
                    email,
                    error: error.message,
                    translated,
                    duration_ms: duration
                });
                setAuthError(translated);
                return { error: translated, needsConfirmation: false };
            }

            // If user is returned but no session, email confirmation is required
            const needsConfirmation = !!data.user && !data.session;
            console.log(`[Auth] signUp SUCCESS (${duration}ms) — needsConfirmation:`, needsConfirmation);
            logDebug('auth', 'signup_success', {
                email,
                needs_confirmation: needsConfirmation,
                duration_ms: duration
            });
            setAuthError(null);
            return { error: null, needsConfirmation };

        } catch (err: unknown) {
            const error = err as Error;
            const duration = Math.round(performance.now() - startTime);
            const translated = translateError(error);
            console.error(`[Auth] signUp CRASH (${duration}ms):`, error);
            logDebug('auth', 'signup_crash', {
                email,
                error: error.message,
                duration_ms: duration
            });
            setAuthError(translated);
            return { error: translated, needsConfirmation: false };
        }
    };

    // ─── Sign Out ──────────────────────────────────────────────────────────────

    const signOut = async () => {
        console.log('[Auth] signOut initiated for:', user?.email);
        const startTime = performance.now();

        try {
            const { error } = await supabase.auth.signOut();
            const duration = Math.round(performance.now() - startTime);

            if (error) {
                console.error(`[Auth] signOut error (${duration}ms):`, error.message);
                logDebug('auth', 'signout_error', {
                    email: user?.email,
                    error: error.message,
                    duration_ms: duration
                });
                // Still clear local state even if Supabase errors
            }

            console.log(`[Auth] signOut completed (${duration}ms)`);
            logDebug('auth', 'signout_success', {
                email: user?.email,
                duration_ms: duration
            });

            // Clear all app-specific local state
            localStorage.removeItem('active_book_id');
            setAuthError(null);

        } catch (err: unknown) {
            const error = err as Error;
            const duration = Math.round(performance.now() - startTime);
            console.error(`[Auth] signOut CRASH (${duration}ms):`, error);
            logDebug('auth', 'signout_crash', {
                email: user?.email,
                error: error.message,
                duration_ms: duration
            });
            // Force clean local state anyway — user expects to be logged out
            localStorage.removeItem('active_book_id');
        }
    };

    return (
        <AuthContext.Provider value={{
            user, session, loading, authError,
            signIn, signUp, signOut, clearAuthError
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('[Auth] useAuth must be used within an AuthProvider — check your component tree');
    }
    return context;
};
