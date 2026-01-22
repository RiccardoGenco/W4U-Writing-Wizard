import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { callBookAgent, supabase } from '../../lib/api';

interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string; // e.g., 'ironic', 'minimal', 'scientific'
}

const ConceptPage: React.FC = () => {
    const navigate = useNavigate();
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);

    useEffect(() => {
        const bookId = localStorage.getItem('active_book_id');
        if (bookId) {
            const saved = localStorage.getItem(`chat_history_${bookId}`);
            if (saved) setMessages(JSON.parse(saved));
        }
    }, []);

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
            const data = await callBookAgent('INTERVIEW', { userInput: userMsg }, bookId);
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
            alert("Errore comunicazione con l'IA.");
        } finally {
            setLoading(false);
        }
    };

    const selectConcept = async (concept: ConceptCard) => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) return;

        try {
            // 1. Fetch current context to preserve target_pages
            const { data: currentBook } = await supabase
                .from('books')
                .select('context_data')
                .eq('id', bookId)
                .single();

            const currentContext = currentBook?.context_data || {};

            // 2. Update with merge
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

            navigate('/create/configuration');
        } catch (err) {
            console.error(err);
            alert("Errore salvataggio selezione.");
        }
    };

    const handleGenerateConcepts = async () => {
        setLoading(true);
        const bookId = localStorage.getItem('active_book_id');
        // Compile chat history into a single prompt context
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        try {
            // Use a specific action 'GENERATE_CONCEPTS' to tell N8N to switch mode
            const data = await callBookAgent('GENERATE_CONCEPTS', { userInput: context }, bookId);
            const generatedData = data.data || data;

            if (generatedData.bookId) {
                localStorage.setItem('active_book_id', generatedData.bookId);
            }

            if (generatedData.concepts) {
                setConcepts(generatedData.concepts);
            }
        } catch (err) {
            console.error(err);
            alert("Errore generazione concept.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', height: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Wizard Stepper */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ height: '4px', width: '40px', background: 'var(--primary)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
            </div>

            <header style={{ marginBottom: '1rem', textAlign: 'center', flexShrink: 0 }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>L'Intervista</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
                    Definisci la tua idea con l'IA. Quando sei pronto, genera i concept.
                </p>
            </header>

            {concepts.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', overflowY: 'auto', padding: '1rem' }}>
                    {concepts.map((concept, index) => (
                        <motion.div
                            key={concept.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="glass-panel"
                            style={{
                                padding: '2rem',
                                cursor: 'pointer',
                                border: '1px solid var(--glass-border)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}
                            whileHover={{ scale: 1.03, borderColor: 'var(--primary)' }}
                            onClick={() => selectConcept(concept)}
                        >
                            <div>
                                <div style={{
                                    background: 'rgba(79, 70, 229, 0.15)',
                                    color: 'var(--accent)',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    marginBottom: '1rem'
                                }}>
                                    {concept.style.toUpperCase()}
                                </div>
                                <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{concept.title}</h3>
                                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{concept.description}</p>
                            </div>
                            <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', color: 'var(--primary)', fontWeight: 600 }}>
                                Scegli questo <ArrowRight size={16} style={{ marginLeft: 'auto' }} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                    {/* Chat Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', marginTop: '2rem', opacity: 0.5 }}>
                                <Sparkles size={40} style={{ marginBottom: '1rem' }} />
                                <p>Raccontami la tua idea...</p>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                padding: '1rem',
                                borderRadius: '12px',
                                maxWidth: '80%',
                                lineHeight: 1.5
                            }}>
                                {msg.content}
                            </div>
                        ))}
                        {loading && (
                            <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                <Loader2 className="animate-spin" size={20} /> Sto pensando...
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div style={{ padding: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Rispondi..."
                                style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="btn-secondary"
                                disabled={loading || !inputValue.trim()}
                                style={{ padding: '0 1.5rem' }}
                            >
                                Invia
                            </button>
                        </form>

                        {messages.length > 2 && (
                            <button
                                onClick={handleGenerateConcepts}
                                className="btn-primary"
                                style={{ width: '100%', padding: '0.8rem' }}
                                disabled={loading}
                            >
                                <Sparkles size={18} style={{ marginRight: '0.5rem' }} />
                                Genera Concept Ora
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConceptPage;
