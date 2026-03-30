import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

export const PaymentCancel: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-panel"
                style={{ maxWidth: '500px', width: '100%', padding: '3rem', textAlign: 'center' }}
            >
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'rgba(251, 113, 133, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem',
                    border: '1px solid rgba(251, 113, 133, 0.2)',
                    boxShadow: '0 0 30px rgba(251, 113, 133, 0.2)'
                }}>
                    <XCircle size={40} color="var(--error)" />
                </div>

                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
                    Pagamento Annullato
                </h1>

                <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.1rem', lineHeight: 1.6 }}>
                    Il processo di checkout è stato interrotto. Nessun addebito è stato effettuato. Puoi riprovare quando sei pronto.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/pricing')}
                        className="btn-primary"
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.8rem', fontSize: '1.2rem', padding: '1rem' }}
                    >
                        <RefreshCw size={20} />
                        Riprova il Pagamento
                    </button>

                    <button
                        onClick={() => navigate('/')}
                        className="btn-secondary"
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.8rem', fontSize: '1.1rem', padding: '1rem' }}
                    >
                        <ArrowLeft size={20} />
                        Torna alla Libreria
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
