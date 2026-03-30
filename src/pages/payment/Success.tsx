import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, BookText } from 'lucide-react';

export const PaymentSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const sessionId = searchParams.get('session_id');

    useEffect(() => {
        if (!sessionId) {
            navigate('/');
        }
    }, [sessionId, navigate]);

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
                    background: 'rgba(52, 211, 153, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem',
                    border: '1px solid rgba(52, 211, 153, 0.2)',
                    boxShadow: '0 0 30px rgba(52, 211, 153, 0.2)'
                }}>
                    <CheckCircle2 size={40} color="var(--success)" />
                </div>

                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
                    Pagamento Riuscito!
                </h1>

                <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.1rem', lineHeight: 1.6 }}>
                    Il tuo Token di Generazione è stato aggiunto al tuo account. Ora puoi iniziare a creare il tuo nuovo manoscritto con l'Intelligenza Artificiale.
                </p>

                <button
                    onClick={() => navigate('/')}
                    className="btn-primary"
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.8rem', fontSize: '1.2rem', padding: '1.2rem' }}
                >
                    <BookText size={24} />
                    Vai alla Libreria
                    <ChevronRight size={24} />
                </button>
            </motion.div>
        </div>
    );
};
