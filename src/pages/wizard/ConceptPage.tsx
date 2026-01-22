import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { callBookAgent, supabase } from '../../lib/api';

interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string;
}

const ConceptPage: React.FC = () => {
    const navigate = useNavigate();
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [bookTitle, setBookTitle] = useState<string | null>(null);

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (bookId) {
            fetchBookTitle();
            const saved = localStorage.getItem(`chat_history_${bookId}`);
            if (saved) setMessages(JSON.parse(saved));
        }
    }, [bookId]);

    const fetchBookTitle = async () => {
        if (!supabase || !bookId) return;
        const { data } = await supabase.from('books').select('title').eq('id', bookId).single();
        if (data) setBookTitle(data.title);
    };

    useEffect(() => {
        const bookId = localStorage.getItem('active_book_id');
        if (bookId && messages.length > 0) {
            localStorage.setItem(`chat_history_${bookId}`, JSON.stringify(messages));
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const bookId = localStorage.getItem('active_book_id');
        const userMsg = inputValue;

        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInputValue('');
        setLoading(true);

        try {
            const data = await callBookAgent('INTERVIEW', { userInput: userMsg, title: bookTitle }, bookId);
            const generatedData = data.data || data;

            if (generatedData.bookId) {
                localStorage.setItem('active_book_id', generatedData.bookId);
            }

            if (generatedData.concepts) {
                setConcepts(generatedData.concepts);
            } else if (generatedData.title_options) {
                setConcepts(generatedData.title_options.map((t: string, i: number) => ({
                    id: i.toString(),
                    title: t,
                    description: `Un approccio basato sul genere ${generatedData.genre}`,
                    style: ['Ironico', 'Pratico', 'Scientifico'][i % 3]
                })));
            } else if (generatedData.aiContent || generatedData.aiResponse) {
                setMessages(prev => [...prev, { role: 'assistant', content: generatedData.aiContent || generatedData.aiResponse }]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const selectConcept = async (concept: ConceptCard) => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) return;

        try {
            const { data: currentBook } = await supabase
                .from('books')
                .select('context_data')
                .eq('id', bookId)
                .single();

            const currentContext = currentBook?.context_data || {};

            await supabase
                .from('books')
                .update({
                    status: 'CONFIGURATION',
                    title: concept.title,
                    context_data: {
                        ...currentContext,
                        selected_concept: concept,
                        chat_history: messages
                    }
                })
                .eq('id', bookId);

            setBookTitle(concept.title);
            navigate('/create/configuration');
        } catch (err) {
            console.error(err);
        }
    };

    const handleGenerateConcepts = async () => {
        setLoading(true);
        const bookId = localStorage.getItem('active_book_id');
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        try {
            const data = await callBookAgent('GENERATE_CONCEPTS', { userInput: context, title: bookTitle }, bookId);
            const generatedData = data.data || data;

            if (generatedData.bookId) {
                localStorage.setItem('active_book_id', generatedData.bookId);
            }

            if (generatedData.concepts) {
                setConcepts(generatedData.concepts);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', height: '90vh', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '2rem', justifyContent: 'center', flexShrink: 0 }}>
                {[1, 2, 3, 4].map((step) => (
                    <motion.div
                        key={step}
                        initial={false}
                        animate={{
                            width: step === 1 ? '60px' : '40px',
                            background: step === 1 ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            boxShadow: step === 1 ? '0 0 15px rgba(0, 242, 255, 0.3)' : 'none'
                        }}
                        style={{ height: '5px', borderRadius: '10px' }}
                    />
                ))}
            </div>

            <header style={{ marginBottom: '2rem', textAlign: 'center', flexShrink: 0 }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', letterSpacing: '-0.05em' }}>L'Intervista</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Definisci la tua visione. L'IA sta ascoltando.
                </p>
            </header>

            {concepts.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', overflowY: 'auto', padding: '1rem' }}>
                    {concepts.map((concept, index) => (
                        <motion.div
                            key={concept.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                            className="glass-panel"
                            style={{
                                padding: '2.5rem',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                minHeight: '320px'
                            }}
                            whileHover={{ y: -10, borderColor: 'rgba(0, 242, 255, 0.4)', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)' }}
                            onClick={() => selectConcept(concept)}
                        >
                            <div>
                                <div style={{
                                    background: 'rgba(0, 242, 255, 0.05)',
                                    color: 'var(--primary)',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    display: 'inline-block',
                                    marginBottom: '1.5rem',
                                    border: '1px solid rgba(0, 242, 255, 0.1)',
                                    letterSpacing: '0.05em'
                                }}>
                                    {concept.style.toUpperCase()}
                                </div>
                                <h3 style={{ fontSize: '1.8rem', marginBottom: '1.2rem', lineHeight: 1.2 }}>{concept.title}</h3>
                                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.95rem' }}>{concept.description}</p>
                            </div>
                            <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', color: 'var(--primary)', fontWeight: 700 }}>
                                Seleziona questo <ArrowRight size={18} style={{ marginLeft: 'auto' }} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderRadius: '24px' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <AnimatePresence>
                            {messages.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    style={{ textAlign: 'center', marginTop: '4rem' }}
                                >
                                    <Sparkles size={60} style={{ marginBottom: '1.5rem' }} />
                                    <p style={{ fontSize: '1.2rem' }}>Inizia a descrivere la tua storia...</p>
                                </motion.div>
                            )}
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    style={{
                                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                        background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                                        color: msg.role === 'user' ? '#000' : 'white',
                                        padding: '1.2rem 1.6rem',
                                        borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                                        maxWidth: '75%',
                                        lineHeight: 1.6,
                                        fontWeight: msg.role === 'user' ? 600 : 400,
                                        boxShadow: msg.role === 'user' ? '0 10px 20px rgba(0, 242, 255, 0.1)' : 'none',
                                        border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)'
                                    }}
                                >
                                    {msg.content}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {loading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ alignSelf: 'flex-start', background: 'rgba(0, 242, 255, 0.03)', padding: '1.2rem 1.6rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.8rem', color: 'var(--primary)' }}
                            >
                                <Loader2 className="animate-spin" size={18} /> <span>L'editor sta scrivendo...</span>
                            </motion.div>
                        )}
                    </div>

                    <div style={{ padding: '2rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}>
                        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Scrivi qui la tua risposta..."
                                style={{ flex: 1, borderRadius: '16px' }}
                                autoFocus
                            />
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                type="submit"
                                className="btn-primary"
                                disabled={loading || !inputValue.trim()}
                                style={{ padding: '0 2rem' }}
                            >
                                Invia
                            </motion.button>
                        </form>

                        {messages.length > 2 && (
                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={handleGenerateConcepts}
                                className="btn-secondary"
                                style={{ width: '100%', borderRadius: '16px', color: 'var(--primary)', borderColor: 'var(--primary)', background: 'rgba(0, 242, 255, 0.05)' }}
                                disabled={loading}
                            >
                                <Sparkles size={18} /> Genera Proposte di Concept
                            </motion.button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConceptPage;
