import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { logDebug } from '../../lib/api';
import { motion } from 'framer-motion';
import { Book, LogIn, Eye, EyeOff, AlertCircle, WifiOff } from 'lucide-react';

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { signIn, resendConfirmationEmail, user, clearAuthError } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);

    const from = (location.state as any)?.from?.pathname || '/';

    // If user is already logged in, redirect away from login
    useEffect(() => {
        if (user) {
            console.log('[LoginPage] User already authenticated — redirecting to:', from);
            navigate(from, { replace: true });
        }
    }, [user, from, navigate]);

    // Clear previous errors when mounting
    useEffect(() => {
        console.log('[LoginPage] Mounted — redirect target:', from);
        clearAuthError();
    }, [clearAuthError, from]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        console.log('[LoginPage] Login form submitted for:', email);

        // Client-side validation
        if (!email.trim()) {
            const msg = 'Inserisci il tuo indirizzo email';
            console.warn('[LoginPage] Validation: empty email');
            setError(msg);
            setLoading(false);
            return;
        }

        if (!password) {
            const msg = 'Inserisci la password';
            console.warn('[LoginPage] Validation: empty password');
            setError(msg);
            setLoading(false);
            return;
        }

        const startTime = performance.now();
        const { error: signInError } = await signIn(email, password);
        const duration = Math.round(performance.now() - startTime);

        if (signInError) {
            console.warn(`[LoginPage] Login failed (${duration}ms):`, signInError);
            setError(signInError);
            setLoading(false);
        } else {
            console.log(`[LoginPage] Login success (${duration}ms) — navigating to:`, from);
            logDebug('auth', 'login_page_success', { email, redirect_to: from, duration_ms: duration });
            navigate(from, { replace: true });
        }
    };

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-dark)',
            backgroundImage: `
                radial-gradient(at 20% 30%, rgba(0, 242, 255, 0.06) 0px, transparent 50%),
                radial-gradient(at 80% 70%, rgba(34, 211, 238, 0.04) 0px, transparent 50%)
            `,
            overflow: 'hidden'
        }}>
            {/* Background Grid */}
            <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'
            }}>
                <div className="loading-grid" style={{ opacity: 0.3 }} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="glass-panel"
                style={{
                    width: '100%',
                    maxWidth: '440px',
                    padding: '3rem',
                    position: 'relative',
                    zIndex: 1
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
                    Accedi al tuo workspace creativo
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                                {error.includes('connessione') ? (
                                    <WifiOff size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                ) : (
                                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                )}
                                <span>{error}</span>
                            </div>

                            {/* "Email not confirmed" specific action */}
                            {error.includes('non ancora confermata') && !resendSuccess && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setResending(true);
                                        const { error: resendError } = await resendConfirmationEmail(email);
                                        if (resendError) setError(resendError);
                                        else setResendSuccess(true);
                                        setResending(false);
                                    }}
                                    disabled={resending}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--primary)',
                                        fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline',
                                        textAlign: 'left', marginLeft: '1.6rem', marginTop: '0.2rem',
                                        opacity: resending ? 0.5 : 1
                                    }}
                                >
                                    {resending ? 'Invio in corso...' : 'Reinvia email di conferma'}
                                </button>
                            )}

                            {resendSuccess && (
                                <p style={{
                                    color: 'var(--success)', fontSize: '0.8rem',
                                    marginLeft: '1.6rem', marginTop: '0.2rem', fontWeight: 600
                                }}>
                                    Email inviata! Controlla la tua posta.
                                </p>
                            )}
                        </div>
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
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
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
                        <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
                            <Link to="/forgot-password" style={{
                                color: 'var(--text-muted)', textDecoration: 'none',
                                fontSize: '0.8rem', transition: 'color 0.2s'
                            }} className="hover-primary">
                                Password dimenticata?
                            </Link>
                        </div>
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
                            <LogIn size={18} />
                        )}
                        {loading ? 'Accesso in corso...' : 'Accedi'}
                    </button>
                </form>

                {/* Register Link */}
                <p style={{
                    textAlign: 'center', marginTop: '2rem',
                    color: 'var(--text-muted)', fontSize: '0.85rem'
                }}>
                    Non hai un account?{' '}
                    <Link to="/register" style={{
                        color: 'var(--primary)', textDecoration: 'none',
                        fontWeight: 600, transition: 'opacity 0.2s'
                    }}>
                        Registrati
                    </Link>
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
