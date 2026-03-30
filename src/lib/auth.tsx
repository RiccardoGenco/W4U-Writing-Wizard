import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './api';
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
    isAdmin: boolean;
    authError: string | null;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string, authorName?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
    signOut: () => Promise<void>;
    resendConfirmationEmail: (email: string) => Promise<{ error: string | null }>;
    resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
    updatePassword: (password: string) => Promise<{ error: string | null }>;
    updateEmail: (email: string) => Promise<{ error: string | null }>;
    updateMetadata: (metadata: Record<string, any>) => Promise<{ error: string | null }>;
    updatePreferences: (preferences: Record<string, any>) => Promise<{ error: string | null }>;
    clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Auth Provider ─────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const clearAuthError = useCallback(() => setAuthError(null), []);

    // DUAL STRATEGY: JWT claim first (instant), DB fallback if hook not active
    const resolveAdminStatus = async (s: Session | null): Promise<boolean> => {
        if (!s?.user) return false;

        // Strategy 1: Read from JWT app_metadata (works when hook is active)
        const jwtClaim = s.user.app_metadata?.is_admin;
        if (jwtClaim === true || jwtClaim === false) {
            console.log('[Auth] Admin from JWT claim:', jwtClaim);
            return jwtClaim;
        }

        // Strategy 2: Fallback — query profiles directly (works when hook is inactive)
        console.log('[Auth] JWT claim absent, querying DB...');
        try {
            const queryPromise = supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', s.user.id)
                .single();

            const timeoutPromise = new Promise<null>(resolve =>
                setTimeout(() => resolve(null), 6000)
            );

            const result = await Promise.race([queryPromise, timeoutPromise]);
            if (!result) { console.warn('[Auth] DB admin check timed out'); return false; }
            const { data, error } = result as any;
            if (error) { console.warn('[Auth] DB admin check error:', error.message); return false; }
            console.log('[Auth] Admin from DB:', data?.is_admin);
            return data?.is_admin === true;
        } catch (err) {
            console.error('[Auth] DB admin check crashed:', err);
            return false;
        }
    };

    useEffect(() => {
        console.log('[Auth] Initializing AuthProvider...');

        // 1. Initial manual check
        const initializeAuth = async () => {
            try {
                const { data: { session: initialSession } } = await supabase.auth.getSession();
                console.log('[Auth] Initial session check:', initialSession ? 'Found' : 'None');
                setSession(initialSession);
                setUser(initialSession?.user ?? null);
                setIsAdmin(await resolveAdminStatus(initialSession));
            } catch (err) {
                console.error('[Auth] Fatal initialization error:', err);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();

        // 2. Subscription for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            console.log(`[Auth] Auth state changed: event=${event}, user=${newSession?.user?.email ?? 'none'}`);

            setSession(newSession);
            setUser(newSession?.user ?? null);
            const adminStatus = await resolveAdminStatus(newSession);
            setIsAdmin(adminStatus);
            setLoading(false);

            if (event === 'SIGNED_OUT') {
                console.log('[Auth] User signed out — clearing local state');
                setAuthError(null);
                localStorage.removeItem('active_book_id');
            } else if (event === 'SIGNED_IN') {
                console.log('[Auth] User signed in — claiming legacy books...');
                supabase.rpc('claim_legacy_books').then(({ data, error }) => {
                    if (error) console.warn('[Auth] claim_legacy_books failed:', error.message);
                    else if (data && data > 0) console.log(`[Auth] Claimed ${data} legacy book(s)`);
                });
            }
        });

        return () => {
            console.log('[Auth] Cleaning up auth listener');
            subscription.unsubscribe();
        };
    }, []);

    // ─── Authentication Methods ───────────────────────────────────────────────

    const signIn = async (email: string, password: string) => {
        console.log('[Auth] signIn attempt for:', email);

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                const translated = translateError(error);
                setAuthError(translated);
                return { error: translated };
            }
            setAuthError(null);
            return { error: null };
        } catch (err: any) {
            const translated = translateError(err);
            setAuthError(translated);
            return { error: translated };
        }
    };

    const signUp = async (email: string, password: string, authorName?: string) => {
        console.log('[Auth] signUp attempt for:', email);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { author_name: authorName || '' },
                    emailRedirectTo: window.location.origin
                }
            });
            if (error) {
                const translated = translateError(error);
                setAuthError(translated);
                return { error: translated, needsConfirmation: false };
            }
            const needsConfirmation = !!data.user && !data.session;
            setAuthError(null);
            return { error: null, needsConfirmation };
        } catch (err: any) {
            const translated = translateError(err);
            setAuthError(translated);
            return { error: translated, needsConfirmation: false };
        }
    };

    const signOut = async () => {
        console.log('[Auth] signOut initiated');
        try {
            await supabase.auth.signOut();
            localStorage.removeItem('active_book_id');
            setAuthError(null);
        } catch (err: any) {
            console.error('[Auth] signOut CRASH:', err);
            localStorage.removeItem('active_book_id');
        }
    };

    const resendConfirmationEmail = async (email: string) => {
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: { emailRedirectTo: window.location.origin }
            });
            if (error) return { error: translateError(error) };
            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    const resetPasswordForEmail = async (email: string) => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`
            });
            if (error) return { error: translateError(error) };
            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    const updatePassword = async (password: string) => {
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) return { error: translateError(error) };
            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    const updateEmail = async (email: string) => {
        try {
            const { error } = await supabase.auth.updateUser({ email });
            if (error) return { error: translateError(error) };
            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    const updateMetadata = async (metadata: Record<string, any>) => {
        try {
            // 1. Update Auth Metadata
            const { error: authError } = await supabase.auth.updateUser({ data: metadata });
            if (authError) return { error: translateError(authError) };

            // 2. Sync with profiles table if author_name is present
            if (user && metadata.author_name !== undefined) {
                const { error: dbError } = await supabase
                    .from('profiles')
                    .update({ full_name: metadata.author_name })
                    .eq('id', user.id);
                
                if (dbError) {
                    console.warn('[Auth] Profile sync failed:', dbError.message);
                    // We don't block the whole operation if sync fails, but we log it
                }
            }

            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    const updatePreferences = async (preferences: Record<string, any>) => {
        try {
            if (!user) return { error: 'Sessione non valida' };
            const { error } = await supabase
                .from('profiles')
                .update({ preferences })
                .eq('id', user.id);
            
            if (error) return { error: translateError(error) };
            return { error: null };
        } catch (err: any) {
            return { error: translateError(err) };
        }
    };

    return (
        <AuthContext.Provider value={{
            user, session, loading, isAdmin, authError,
            signIn, signUp, signOut, resendConfirmationEmail,
            resetPasswordForEmail, updatePassword, updateEmail, updateMetadata, updatePreferences, clearAuthError
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('[Auth] useAuth must be used within an AuthProvider — check your component tree');
    }
    return context;
};
