import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { callBookAgent, supabase, logDebug } from '../../lib/api';
import { getQuestionsForGenre } from '../../data/genres';

interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string;
}


const CONCEPT_LOADING_PHASES = [
    'Analisi delle tue risposte...',
    'Esplorazione temi narrativi...',
    'Sviluppo archi narrativi...',
    'Creazione personaggi chiave...',
    'Definizione ambientazioni...',
    'Composizione proposte di concept...',
    'Rifinitura idee...',
];

const ConceptPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [bookTitle, setBookTitle] = useState<string | null>(null);
    const [genre, setGenre] = useState<string | null>(null);
    const [answers, setAnswers] = useState<string[]>(Array(8).fill(''));
    const [loadingMessage, setLoadingMessage] = useState(CONCEPT_LOADING_PHASES[0]);

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (bookId) {
            fetchBookData();
        }
    }, [bookId]);

    // Rotating loading messages
    useEffect(() => {
        if (!loading) return;
        let phaseIndex = 0;
        setLoadingMessage(CONCEPT_LOADING_PHASES[0]);
        const interval = setInterval(() => {
            phaseIndex = (phaseIndex + 1) % CONCEPT_LOADING_PHASES.length;
            setLoadingMessage(CONCEPT_LOADING_PHASES[phaseIndex]);
        }, 2500);
        return () => clearInterval(interval);
    }, [loading]);

    const fetchBookData = async () => {
        if (!supabase || !bookId) return;
        const { data } = await supabase.from('books').select('title, genre, context_data').eq('id', bookId).single();
        if (data) {
            setBookTitle(data.title);
            setGenre(data.genre);
            if (data.context_data?.answers) {
                setAnswers(data.context_data.answers);
            }
        }
    };

    const handleAnswerChange = (index: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const selectConcept = async (concept: ConceptCard) => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) return;

        await logDebug('frontend', 'concept_selected', { conceptId: concept.id, title: concept.title }, bookId);

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
                        answers: answers
                    }
                })
                .eq('id', bookId);

            setBookTitle(concept.title);
            navigate('/create/configuration');
        } catch (err: any) {
            console.error(err);
            await logDebug('frontend', 'concept_selection_error', { error: err.message }, bookId);
        }
    };

    const handleGenerateConcepts = async () => {
        setLoading(true);
        const bookId = localStorage.getItem('active_book_id');

        const questions = getQuestionsForGenre(genre || '');
        const context = questions.map((q, i) => `D: ${q}\nR: ${answers[i]}`).join('\n\n');

        await logDebug('frontend', 'concept_generation_start', { genre, inputs_length: context.length }, bookId);
        const startTime = performance.now();

        try {
            const data = await callBookAgent('GENERATE_CONCEPTS', { userInput: context, title: bookTitle }, bookId);
            const generatedData = data.data || data;

            if (generatedData.bookId) {
                localStorage.setItem('active_book_id', generatedData.bookId);
            }

            if (generatedData.concepts) {
                setConcepts(generatedData.concepts);
                await logDebug('frontend', 'concept_generation_complete', {
                    count: generatedData.concepts.length,
                    duration_ms: Math.round(performance.now() - startTime)
                }, bookId);
            }
        } catch (err: any) {
            console.error(err);
            await logDebug('frontend', 'concept_generation_error', {
                error: err.message,
                duration_ms: Math.round(performance.now() - startTime)
            }, bookId);
        } finally {
            setLoading(false);
        }
    };



    const questions = getQuestionsForGenre(genre || '');
    const answeredCount = answers.filter(a => a.trim().length > 0).length;
    const isComplete = answeredCount >= 4;

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', minHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* OVERLAY GENERAZIONE CONCEPT */}
            {loading && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(5, 5, 8, 0.95)',
                    backdropFilter: 'blur(20px)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    {/* Spinner animato */}
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        border: '3px solid rgba(0, 242, 255, 0.1)',
                        borderTop: '3px solid var(--primary)',
                        borderRight: '3px solid var(--accent)',
                        animation: 'spin 1s linear infinite',
                        boxShadow: '0 0 30px rgba(0, 242, 255, 0.3)'
                    }} />

                    {/* Testo principale */}
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{
                            fontSize: '1.8rem',
                            color: 'var(--primary)',
                            marginBottom: '0.5rem',
                            textShadow: '0 0 20px rgba(0, 242, 255, 0.5)',
                            transition: 'all 0.3s ease'
                        }}>
                            {loadingMessage}
                        </h2>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            L'IA sta elaborando proposte uniche per il tuo {genre || 'libro'}...
                        </p>
                    </div>

                    {/* Barra progresso decorativa */}
                    <div style={{
                        width: '300px',
                        height: '4px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: '50%',
                            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                            borderRadius: '2px',
                            animation: 'shimmer 1.5s infinite linear'
                        }} />
                    </div>

                    <p style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        maxWidth: '400px',
                        textAlign: 'center',
                        opacity: 0.6
                    }}>
                        Non chiudere questa finestra. La generazione può richiedere fino a un minuto.
                    </p>
                </div>
            )}

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

            <header style={{ marginBottom: '3rem', textAlign: 'center', flexShrink: 0 }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', letterSpacing: '-0.05em' }}>
                    {genre ? `Il tuo ${genre}` : 'La tua storia'}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
                    Rispondi a queste 4 domande chiave per permettere all'IA di generare la struttura del tuo libro.
                </p>
            </header>

            {concepts.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', padding: '1rem' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '4rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {questions.map((q, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-panel"
                                style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{
                                        width: '32px',
                                        height: '32px',
                                        minWidth: '32px',
                                        minHeight: '32px',
                                        flexShrink: 0,           // questa serve a non far rimpicciolire il numero e il cerchiett
                                        aspectRatio: '1 / 1',    // ദ്ദി（• ˕ •マ.ᐟ
                                        borderRadius: '50%',
                                        background: 'rgba(0, 242, 255, 0.1)',
                                        color: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.9rem',
                                        fontWeight: 800,
                                        border: '1px solid rgba(0, 242, 255, 0.2)'
                                    }}>
                                        {i + 1}
                                    </span>
                                    <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{q}</h4>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        value={answers[i]}
                                        onChange={(e) => handleAnswerChange(i, e.target.value.slice(0, 200))}
                                        placeholder="Scrivi qui la tua idea (max 200 caratteri)..."
                                        maxLength={200}
                                        style={{
                                            width: '100%',
                                            minHeight: '120px',
                                            resize: 'none',
                                            background: 'rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            borderRadius: '16px',
                                            padding: '1.2rem',
                                            paddingBottom: '2rem',
                                            fontSize: '1rem',
                                            lineHeight: 1.5,
                                            color: 'var(--text-main)'
                                        }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10px',
                                        right: '15px',
                                        fontSize: '0.75rem',
                                        color: answers[i].length >= 180 ? 'var(--error)' : 'var(--text-muted)',
                                        fontWeight: 600
                                    }}>
                                        {answers[i].length} / 200
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div style={{ textAlign: 'center' }}>
                        <motion.button
                            whileHover={isComplete ? { scale: 1.05 } : {}}
                            whileTap={isComplete ? { scale: 0.95 } : {}}
                            onClick={handleGenerateConcepts}
                            className="btn-primary"
                            disabled={loading || !isComplete}
                            style={{
                                padding: '1.5rem 4rem',
                                fontSize: '1.2rem',
                                gap: '1rem',
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={24} />
                                    Generazione in corso...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={24} />
                                    Genera Proposte di Concept
                                </>
                            )}
                        </motion.button>
                        {!isComplete && (
                            <p style={{ color: 'var(--text-muted)', marginTop: '1.5rem', fontSize: '0.9rem' }}>
                                Rispondi a tutte le domande per procedere
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConceptPage;