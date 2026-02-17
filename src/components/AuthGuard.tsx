import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Timeout (in ms) after which we assume auth is stuck and show a fallback
const AUTH_TIMEOUT_MS = 10_000;

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [timedOut, setTimedOut] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!loading) {
            console.log(`[AuthGuard] Auth resolved — user: ${user?.email ?? 'none'}, path: ${location.pathname}`);
            // Reset timedOut if auth resolves, but only if it's currently true to avoid unnecessary state updates
            setTimedOut(prev => prev ? false : prev);
            return;
        }

        console.log(`[AuthGuard] Waiting for auth to resolve (timeout: ${AUTH_TIMEOUT_MS}ms)...`);
        timerRef.current = setTimeout(() => {
            // Only set timedOut if loading is still true after the timeout
            if (loading) {
                console.error(`[AuthGuard] Auth loading timed out after ${AUTH_TIMEOUT_MS}ms — showing fallback`);
                setTimedOut(true);
            }
        }, AUTH_TIMEOUT_MS);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [loading, user, location.pathname]);

    // ─── Timeout Fallback ──────────────────────────────────────────────────────
    if (timedOut) {
        return (
            <div style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-dark)', flexDirection: 'column', gap: '1.5rem',
                padding: '2rem', textAlign: 'center'
            }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '2px solid #fbbf24',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <AlertTriangle size={28} color="#fbbf24" />
                </div>
                <h2 style={{ color: 'white', fontSize: '1.3rem' }}>
                    Connessione lenta
                </h2>
                <p style={{
                    color: 'var(--text-muted)', fontSize: '0.9rem',
                    maxWidth: '360px', lineHeight: 1.6
                }}>
                    Non siamo riusciti a verificare la tua sessione.
                    Controlla la connessione internet e riprova.
                </p>
                <button
                    className="btn-primary"
                    onClick={() => {
                        console.log('[AuthGuard] User clicked reload after timeout');
                        window.location.reload();
                    }}
                    style={{ gap: '0.5rem', padding: '0.8rem 2rem' }}
                >
                    <RefreshCw size={16} /> Riprova
                </button>
            </div>
        );
    }

    // ─── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-dark)', flexDirection: 'column', gap: '1.5rem'
            }}>
                <div className="cyber-spinner">
                    <div className="spinner-ring" />
                    <div className="spinner-ring" />
                    <div className="spinner-core" />
                </div>
                <p style={{
                    color: 'var(--text-muted)', fontSize: '0.9rem',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    Caricamento sessione...
                </p>
            </div>
        );
    }

    // ─── Not Authenticated ─────────────────────────────────────────────────────
    if (!user) {
        console.log(`[AuthGuard] No user — redirecting to /login (from: ${location.pathname})`);
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // ─── Authenticated ─────────────────────────────────────────────────────────
    return <>{children}</>;
};

export default AuthGuard;
