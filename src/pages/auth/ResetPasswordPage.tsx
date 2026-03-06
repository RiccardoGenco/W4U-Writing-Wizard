import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { logDebug } from '../../lib/api';
import { motion } from 'framer-motion';
import { Book, Lock, Eye, EyeOff, AlertCircle, CheckCircle, WifiOff } from 'lucide-react';

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const { updatePassword, user, loading: authLoading, clearAuthError } = useAuth();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Clear errors on mount
    useEffect(() => {
        clearAuthError();
    }, [clearAuthError]);

    // If no user is present after auth settles, it means the link was invalid or expired
    useEffect(() => {
        if (!authLoading && !user && !success) {
            console.warn('[ResetPasswordPage] No session found — link might be invalid');
            setError('Il link di reset è scaduto o non è valido. Richiedine uno nuovo.');
        }
    }, [user, authLoading, success]);

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

        if (password !== confirmPassword) {
            setError('Le password non coincidono');
            return;
        }

        if (password.length < 8) {
            setError('La password deve essere di almeno 8 caratteri');
            return;
        }

        setLoading(true);
        console.log('[ResetPasswordPage] Updating password for user:', user?.email);

        const startTime = performance.now();
        const { error: updateError } = await updatePassword(password);
        const duration = Math.round(performance.now() - startTime);

        if (updateError) {
            console.warn(`[ResetPasswordPage] Update failed (${duration}ms):`, updateError);
            setError(updateError);
            setLoading(false);
        } else {
            console.log(`[ResetPasswordPage] Update SUCCESS (${duration}ms)`);
            logDebug('auth', 'reset_password_success', { duration_ms: duration });
            setSuccess(true);
            setLoading(false);

            // Redirect to login after a short delay
            setTimeout(() => {
                navigate('/login', { replace: true });
            }, 3000);
        }
    };

    const strength = passwordStrength();

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
                    <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Nuova Password</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Imposta la tua nuova chiave di accesso
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
                        <h3 style={{ color: 'white', marginBottom: '1rem' }}>Password Aggiornata!</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                            La tua password è stata resettata con successo.
                            Verrai reindirizzato al login tra pochi istanti.
                        </p>
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
                                {error.includes('scaduto') && (
                                    <Link to="/forgot-password" style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                        Riprova
                                    </Link>
                                )}
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{
                                    display: 'block', fontSize: '0.75rem', fontWeight: 600,
                                    color: 'var(--text-muted)', marginBottom: '0.5rem',
                                    letterSpacing: '0.05em', textTransform: 'uppercase'
                                }}>
                                    Nuova Password
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
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {/* Strength meter */}
                                {password.length > 0 && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <motion.div
                                                animate={{ width: strength.width }}
                                                style={{ height: '100%', background: strength.color, borderRadius: '2px', boxShadow: `0 0 8px ${strength.color}` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{
                                    display: 'block', fontSize: '0.75rem', fontWeight: 600,
                                    color: 'var(--text-muted)', marginBottom: '0.5rem',
                                    letterSpacing: '0.05em', textTransform: 'uppercase'
                                }}>
                                    Conferma Password
                                </label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
                                    placeholder="Ripeti la password"
                                    required
                                    autoComplete="new-password"
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading || !password || !confirmPassword || !!authLoading}
                                style={{ width: '100%', marginTop: '0.5rem', gap: '0.6rem' }}
                            >
                                {loading ? (
                                    <div className="animate-spin" style={{ width: 18, height: 18, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }} />
                                ) : (
                                    <Lock size={18} />
                                )}
                                {loading ? 'Aggiornamento...' : 'Reimposta Password'}
                            </button>
                        </form>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
