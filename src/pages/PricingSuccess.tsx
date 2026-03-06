import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Wallet, ArrowRight } from 'lucide-react';
import { useWallet } from '../lib/useWallet';

export const PricingSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const isMock = searchParams.get('mock') === 'true';
    const amount = searchParams.get('amount');
    const { wallet, refreshWallet } = useWallet();
    const [refreshed, setRefreshed] = useState(false);

    useEffect(() => {
        // Refresh wallet balance after successful payment
        const timer = setTimeout(async () => {
            await refreshWallet();
            setRefreshed(true);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            flexDirection: 'column',
            gap: '2rem',
            textAlign: 'center'
        }}>
            <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: 'rgba(0, 242, 120, 0.1)',
                border: '2px solid rgba(0, 242, 120, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'fadeIn 0.5s ease'
            }}>
                <CheckCircle size={40} color="#00f278" />
            </div>

            <div>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                    Ricarica completata!
                </h1>
                {amount && (
                    <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
                        €{amount} {isMock ? '(mock)' : ''} sono stati aggiunti al tuo wallet.
                    </p>
                )}
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Wallet size={24} color="var(--primary)" />
                <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Saldo Attuale
                    </p>
                    <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                        {refreshed && wallet ? `€ ${wallet.balance.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '...'}
                    </p>
                </div>
            </div>

            <Link to="/dashboard" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 2rem' }}>
                Vai alla Dashboard <ArrowRight size={18} />
            </Link>
        </div>
    );
};

export default PricingSuccess;
