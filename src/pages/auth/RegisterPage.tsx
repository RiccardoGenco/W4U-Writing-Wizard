import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { logDebug } from '../../lib/api';
import { motion } from 'framer-motion';
import { Book, UserPlus, Eye, EyeOff, AlertCircle, CheckCircle, WifiOff } from 'lucide-react';

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { signUp, user, clearAuthError } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authorName, setAuthorName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // If user is already logged in, redirect
    useEffect(() => {
        if (user) {
            console.log('[RegisterPage] User already authenticated — redirecting to /');
            navigate('/', { replace: true });
        }
    }, [user, navigate]);

    // Clear errors on mount
    useEffect(() => {
        console.log('[RegisterPage] Mounted');
        clearAuthError();
    }, [clearAuthError]);

    const passwordStrength = (): { label: string; color: string; width: string } => {
        if (password.length === 0) return { label: '', color: 'transparent', width: '0%' };
        if (password.length < 6) return { label: 'Debole', color: 'var(--error)', width: '25%' };
        if (password.length < 8) return { label: 'Sufficiente', color: '#f59e0b', width: '50%' };
        if (password.length < 12) return { label: 'Buona', color: 'var(--success)', width: '75%' };
        return { label: 'Ottima', color: 'var(--primary)', width: '100%' };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        console.log('[RegisterPage] Registration form submitted for:', email, 'author:', authorName || '(none)');

        // Client-side validation
        if (!email.trim()) {
            const msg = 'Inserisci il tuo indirizzo email';
            console.warn('[RegisterPage] Validation: empty email');
            setError(msg);
            setLoading(false);
            return;
        }

        if (password.length < 8) {
            const msg = 'La password deve essere di almeno 8 caratteri';
            console.warn('[RegisterPage] Validation: password too short:', password.length);
            setError(msg);
            setLoading(false);
            return;
        }

        const startTime = performance.now();
        const { error: signUpError, needsConfirmation } = await signUp(email, password, authorName);
        const duration = Math.round(performance.now() - startTime);

        if (signUpError) {
            console.warn(`[RegisterPage] Registration failed (${duration}ms):`, signUpError);
            setError(signUpError);
            setLoading(false);
        } else if (needsConfirmation) {
            console.log(`[RegisterPage] Registration OK — email confirmation required (${duration}ms)`);
            logDebug('auth', 'register_page_confirmation', { email, duration_ms: duration });
            setSuccess(true);
            setLoading(false);
        } else {
            console.log(`[RegisterPage] Registration OK — auto-login (${duration}ms), navigating to /`);
            logDebug('auth', 'register_page_autologin', { email, duration_ms: duration });
            navigate('/', { replace: true });
        }
    };

    const strength = passwordStrength();

    // ─── Email Confirmation Success View ───────────────────────────────────────
    if (success) {
        console.log('[RegisterPage] Showing email confirmation screen for:', email);
        return (
            <div style={{
                width: '100vw', height: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-dark)',
                backgroundImage: `
                    radial-gradient(at 20% 30%, rgba(0, 242, 255, 0.06) 0px, transparent 50%),
                    radial-gradient(at 80% 70%, rgba(34, 211, 238, 0.04) 0px, transparent 50%)
                `
            }}>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                    <div className="loading-grid" style={{ opacity: 0.3 }} />
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel"
                    style={{
                        maxWidth: '440px', padding: '3rem',
                        textAlign: 'center', position: 'relative', zIndex: 1
                    }}
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
                    <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Controlla la tua email</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                        Abbiamo inviato un link di conferma a <strong style={{ color: 'var(--text-main)' }}>{email}</strong>.
                        Clicca sul link per attivare il tuo account.
                    </p>
                    <Link
                        to="/login"
                        className="btn-primary"
                        style={{ textDecoration: 'none', display: 'inline-flex', gap: '0.5rem', padding: '0.8rem 2rem' }}
                    >
                        Vai al Login
                    </Link>
                </motion.div>
            </div>
        );
    }

    // ─── Registration Form ─────────────────────────────────────────────────────
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

                <p style={{
                    textAlign: 'center', color: 'var(--text-muted)',
                    fontSize: '0.9rem', marginBottom: '2rem'
                }}>
                    Crea il tuo account autore
                </p>

                {/* Error Banner */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                            padding: '0.8rem 1rem', borderRadius: '12px',
                            background: error.includes('connessione')
                                ? 'rgba(251, 191, 36, 0.1)'
                                : 'rgba(251, 113, 133, 0.1)',
                            border: error.includes('connessione')
                                ? '1px solid rgba(251, 191, 36, 0.3)'
                                : '1px solid rgba(251, 113, 133, 0.3)',
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

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: 'var(--text-muted)', marginBottom: '0.5rem',
                            letterSpacing: '0.05em', textTransform: 'uppercase'
                        }}>
                            Nome Autore
                        </label>
                        <input
                            type="text"
                            value={authorName}
                            onChange={e => setAuthorName(e.target.value)}
                            placeholder="Il tuo nome o pseudonimo"
                            autoComplete="name"
                            autoFocus
                            style={{ width: '100%' }}
                        />
                    </div>

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
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: 'var(--text-muted)', marginBottom: '0.5rem',
                            letterSpacing: '0.05em', textTransform: 'uppercase'
                        }}>
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(null); }}
                                placeholder="Minimo 8 caratteri"
                                required
                                autoComplete="new-password"
                                style={{ width: '100%', paddingRight: '3rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '0.8rem', top: '50%',
                                    transform: 'translateY(-50%)', background: 'none',
                                    border: 'none', cursor: 'pointer', padding: '0.3rem',
                                    color: 'var(--text-muted)'
                                }}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {/* Password Strength */}
                        {password.length > 0 && (
                            <div style={{ marginTop: '0.5rem' }}>
                                <div style={{
                                    height: '3px', borderRadius: '2px',
                                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                                }}>
                                    <motion.div
                                        animate={{ width: strength.width }}
                                        style={{
                                            height: '100%', background: strength.color,
                                            borderRadius: '2px', boxShadow: `0 0 8px ${strength.color}`
                                        }}
                                    />
                                </div>
                                <p style={{
                                    fontSize: '0.7rem', color: strength.color,
                                    marginTop: '0.3rem', fontWeight: 600
                                }}>
                                    {strength.label}
                                </p>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || !email || !password}
                        style={{ width: '100%', marginTop: '0.5rem', gap: '0.6rem' }}
                    >
                        {loading ? (
                            <div className="animate-spin" style={{ width: 18, height: 18, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }} />
                        ) : (
                            <UserPlus size={18} />
                        )}
                        {loading ? 'Creazione account...' : 'Crea Account'}
                    </button>
                </form>

                {/* Login Link */}
                <p style={{
                    textAlign: 'center', marginTop: '2rem',
                    color: 'var(--text-muted)', fontSize: '0.85rem'
                }}>
                    Hai già un account?{' '}
                    <Link to="/login" style={{
                        color: 'var(--primary)', textDecoration: 'none',
                        fontWeight: 600, transition: 'opacity 0.2s'
                    }}>
                        Accedi
                    </Link>
                </p>
            </motion.div>
        </div>
    );
};

export default RegisterPage;
