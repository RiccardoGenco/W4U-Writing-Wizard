import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, LifeBuoy, AlertCircle, CreditCard, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

const SUBJECT_OPTIONS = [
    { id: 'general', label: 'Domanda Generale', icon: <MessageSquare size={18} /> },
    { id: 'bug', label: 'Segnala un Bug', icon: <AlertCircle size={18} /> },
    { id: 'billing', label: 'Pagamenti e Fatturazione', icon: <CreditCard size={18} /> },
    { id: 'feature', label: 'Suggerimento Funzionalità', icon: <LifeBuoy size={18} /> },
    { id: 'deletion', label: 'Eliminazione Account', icon: <Trash2 size={18} /> },
];

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
    const { session } = useAuth();
    const [subject, setSubject] = useState('general');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSending(true);
        try {
            const response = await fetch('/api/support', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    subject: SUBJECT_OPTIONS.find(s => s.id === subject)?.label || subject,
                    message,
                    metadata: {
                        page: window.location.pathname,
                        viewport: `${window.innerWidth}x${window.innerHeight}`
                    }
                })
            });

            // Handle non-JSON responses (security errors, proxy 502/504, etc.)
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Il server di supporto non risponde. Assicurati che il backend sia attivo (npm run server).");
            }

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Errore durante l\'invio');

            onSuccess(data.message || 'Messaggio inviato con successo!');
            setMessage('');
            onClose();
        } catch (err: any) {
            console.error('[Support Form] Error:', err);
            onError(err.message || 'Si è verificato un errore imprevisto.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} 
                    />
                    
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        style={{
                            width: '100%',
                            maxWidth: '500px',
                            background: 'rgba(30, 41, 59, 0.95)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '20px',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            padding: '2rem',
                            position: 'relative',
                            color: 'white'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', color: '#ef4444' }}>
                                    <LifeBuoy size={24} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Centro Supporto</h2>
                                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Siamo qui per aiutarti</p>
                                </div>
                            </div>
                            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Oggetto della richiesta</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                    {SUBJECT_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setSubject(opt.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.75rem',
                                                background: subject === opt.id ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${subject === opt.id ? '#ef4444' : 'rgba(255,255,255,0.05)'}`,
                                                borderRadius: '12px',
                                                color: subject === opt.id ? '#fff' : '#94a3b8',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                textAlign: 'left'
                                            }}
                                        >
                                            {opt.icon}
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Come possiamo aiutarti?</label>
                                <textarea
                                    required
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Scrivi qui il tuo messaggio..."
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        resize: 'vertical',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSending || !message.trim()}
                                className="btn-primary"
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.75rem',
                                    padding: '1rem',
                                    opacity: (isSending || !message.trim()) ? 0.6 : 1,
                                    cursor: (isSending || !message.trim()) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                                {isSending ? 'Invio in corso...' : 'Invia Messaggio'}
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
