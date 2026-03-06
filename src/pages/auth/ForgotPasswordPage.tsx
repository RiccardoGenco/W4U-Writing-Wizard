import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { logDebug } from '../../lib/api';
import { motion } from 'framer-motion';
import { Book, Mail, AlertCircle, CheckCircle, ArrowLeft, WifiOff } from 'lucide-react';

const ForgotPasswordPage: React.FC = () => {
    const { resetPasswordForEmail, clearAuthError } = useAuth();
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Clear errors on mount
    React.useEffect(() => {
        clearAuthError();
    }, [clearAuthError]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        console.log('[ForgotPasswordPage] Requesting reset link for:', email);

        if (!email.trim()) {
            setError('Inserisci il tuo indirizzo email');
            setLoading(false);
            return;
        }

        const startTime = performance.now();
        const { error: resetError } = await resetPasswordForEmail(email);
        const duration = Math.round(performance.now() - startTime);

        if (resetError) {
            console.warn(`[ForgotPasswordPage] Request failed (${duration}ms):`, resetError);
            setError(resetError);
            setLoading(false);
        } else {
            console.log(`[ForgotPasswordPage] Request SUCCESS (${duration}ms)`);
            logDebug('auth', 'forgot_password_success', { email, duration_ms: duration });
            setSuccess(true);
            setLoading(false);
        }
    };

    return (
        <div style={{
            width: '100vw', height: '100vh', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-dark)',
            backgroundImage: `
                radial-gradient(at 20% 30%, rgba(0, 242, 255, 0.06) 0px, transparent 50%),
                radial-gradient(at 80% 70%, rgba(34, 211, 238, 0.04) 0px, transparent 50%)
            `,
            overflow: 'hidden'
        }}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div className="loading-grid" style={{ opacity: 0.3 }} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="glass-panel"
                style={{
                    width: '100%', maxWidth: '440px', padding: '3rem',
                    position: 'relative', zIndex: 1
                }}
            >
                {/* Logo */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.75rem', marginBottom: '2.5rem'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                        padding: '0.6rem', borderRadius: '14px',
                        boxShadow: '0 0 25px rgba(0, 242, 255, 0.3)'
                    }}>
                        <Book size={24} color="black" />
                    </div>
                    <h1 style={{
                        fontSize: '1.8rem', letterSpacing: '-0.05em',
                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>
                        W4U Wizard
                    </h1>
                </div>

                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Recupera Password</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Inserisci l'indirizzo email associato al tuo account
                    </p>
                </div>

                {success ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ textAlign: 'center' }}
                    >
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(52, 211, 153, 0.1)',
                            border: '2px solid var(--success)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            boxShadow: '0 0 30px rgba(52, 211, 153, 0.2)'
                        }}>
                            <CheckCircle size={32} color="var(--success)" />
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                            Abbiamo inviato un link di reset a <strong style={{ color: 'var(--text-main)' }}>{email}</strong>.
                            Controlla la tua casella di posta.
                        </p>
                        <Link to="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', gap: '0.5rem', padding: '0.8rem 2rem' }}>
                            Torna al Login
                        </Link>
                    </motion.div>
                ) : (
                    <>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                                    padding: '0.8rem 1rem', borderRadius: '12px',
                                    background: error.includes('connessione') ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 113, 133, 0.1)',
                                    border: error.includes('connessione') ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(251, 113, 133, 0.3)',
                                    marginBottom: '1.5rem', fontSize: '0.85rem',
                                    color: error.includes('connessione') ? '#fbbf24' : 'var(--error)'
                                }}
                            >
                                {error.includes('connessione') ? (
                                    <WifiOff size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                ) : (
                                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                )}
                                <span>{error}</span>
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{
                                    display: 'block', fontSize: '0.75rem', fontWeight: 600,
                                    color: 'var(--text-muted)', marginBottom: '0.5rem',
                                    letterSpacing: '0.05em', textTransform: 'uppercase'
                                }}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setError(null); }}
                                    placeholder="la-tua@email.com"
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading || !email}
                                style={{ width: '100%', gap: '0.6rem' }}
                            >
                                {loading ? (
                                    <div className="animate-spin" style={{ width: 18, height: 18, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }} />
                                ) : (
                                    <Mail size={18} />
                                )}
                                {loading ? 'Inviando link...' : 'Invia Link di Reset'}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                            <Link to="/login" style={{
                                color: 'var(--text-muted)', textDecoration: 'none',
                                fontSize: '0.85rem', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: '0.5rem', transition: 'color 0.2s'
                            }} className="hover-primary">
                                <ArrowLeft size={16} />
                                Torna al Login
                            </Link>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default ForgotPasswordPage;
