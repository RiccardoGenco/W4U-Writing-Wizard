import React, { useState } from 'react';
import { supabase } from '../lib/api';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Loader2, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../lib/useWallet';

const API_BASE_URL = import.meta.env.VITE_APP_URL || 'http://localhost:3000';

const PRESET_AMOUNTS = [30, 50, 100, 250];

export const Pricing: React.FC = () => {
    const [amount, setAmount] = useState<number>(50);
    const [isCustom, setIsCustom] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const { wallet, loading: walletLoading } = useWallet();

    const handleCheckout = async () => {
        if (amount < 5) {
            setError("L'importo minimo di ricarica è di 5€.");
            return;
        }

        setCheckoutLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setError("Devi effettuare l'accesso per acquistare.");
                setCheckoutLoading(false);
                navigate('/login', { state: { returnTo: '/pricing' } });
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/checkout/create-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ amount })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Errore durante la creazione della sessione di pagamento.');
            }

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('URL di checkout non valido.');
            }
        } catch (err: any) {
            console.error('Checkout error:', err);
            setError(err.message || 'Si è verificato un errore imprevisto. Riprova.');
            setCheckoutLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="container-narrow fade-in">
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.05em' }}
                    >
                        Ricarica il tuo Wallet
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{ fontSize: '1.2rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}
                    >
                        Aggiungi fondi al tuo portafoglio per generare i tuoi manoscritti. Paghi solo l'esatto costo del libro al momento della generazione.
                    </motion.p>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="glass-panel"
                >
                    <div style={{ padding: '3rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <Wallet size={28} color="var(--primary)" />
                                Saldo Attuale: {walletLoading ? '...' : `€ ${wallet?.balance.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}`}
                            </h2>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    Importo Ricarica
                                </p>
                                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
                                    <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                                        € {amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                                {PRESET_AMOUNTS.map(preset => (
                                    <button
                                        key={preset}
                                        onClick={() => { setIsCustom(false); setAmount(preset); }}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: '12px',
                                            border: `2px solid ${!isCustom && amount === preset ? 'var(--primary)' : 'var(--glass-border)'}`,
                                            background: !isCustom && amount === preset ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                                            color: 'var(--text-main)',
                                            fontWeight: 700,
                                            fontSize: '1.2rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        € {preset}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700 }}>€</span>
                                    <input
                                        type="number"
                                        min="5"
                                        value={isCustom ? amount : ''}
                                        placeholder="Importo personalizzato"
                                        onChange={(e) => {
                                            setIsCustom(true);
                                            setAmount(Number(e.target.value));
                                        }}
                                        onClick={() => setIsCustom(true)}
                                        style={{ width: '100%', paddingLeft: '2.5rem', borderColor: isCustom ? 'var(--primary)' : 'var(--glass-border)' }}
                                    />
                                </div>
                                {isCustom && amount > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Importo Libero</span>}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '3rem', background: 'rgba(0,0,0,0.2)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[
                                'Paga solo ciò che usi',
                                'Il credito non scade mai',
                                'Fatturazione Automatica',
                                'Pagamento Sicuro con Stripe'
                            ].map((feature, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', color: 'var(--text-main)' }}>
                                    <CheckCircle size={20} color="var(--success)" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={handleCheckout}
                            disabled={checkoutLoading || amount < 5}
                            className="btn-primary"
                            style={{ fontSize: '1.2rem', padding: '1.2rem 3rem', display: 'flex', alignItems: 'center', gap: '1rem', flexGrow: 1, maxWidth: '350px' }}
                        >
                            {checkoutLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={24} />
                                    Attendere...
                                </>
                            ) : (
                                <>
                                    Ricarica {amount}€
                                    <ArrowRight size={20} />
                                </>
                            )}
                        </button>
                    </div>
                    {error && (
                        <div style={{ padding: '1rem', background: 'rgba(251, 113, 133, 0.1)', color: 'var(--error)', textAlign: 'center', borderTop: '1px solid rgba(251, 113, 133, 0.2)' }}>
                            {error}
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};
