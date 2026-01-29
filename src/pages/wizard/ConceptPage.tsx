import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { callBookAgent, supabase } from '../../lib/api';

interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string;
}

const QUESTIONS_BY_GENRE: Record<string, string[]> = {
    'Thriller': [
        'Qual è il crimine o il segreto al centro della storia?',
        'Quale indizio fuorviante confonderà il lettore?',
        'Qual è la debolezza del protagonista?',
        'Come si manifesta il pericolo imminente?'
    ],
    'Noir': [
        'Qual è il fallimento passato che tormenta il protagonista?',
        'Chi è la figura ambigua che lo attira nel caos?',
        'Qual è il marcio nascosto nella società?',
        'C\'è una redenzione possibile?'
    ],
    'Fantasy': [
        'Quali sono le regole uniche del sistema magico?',
        'Chi o cosa rappresenta il male assoluto?',
        'Quale regione remota dovrà essere esplorata?',
        'Quale legame lega l\'eroe al destino del mondo?'
    ],
    'Romanzo Rosa': [
        'Qual è l\'ostacolo insormontabile tra i due amanti?',
        'Quale segreto del passato impedisce la fiducia?',
        'In quale ambientazione sboccia la scintilla?',
        'Qual è il momento di massima rottura?'
    ],
    'Fantascienza': [
        'Quale tecnologia o scoperta ha cambiato il mondo?',
        'Come si è evoluta la società in questo futuro?',
        'Qual è il dilemma etico posto dal progresso?',
        'Esiste una minaccia aliena o interna?'
    ],
    'Storico': [
        'In quale anno e luogo preciso è ambientata?',
        'Quale personaggio storico reale incrocia il cammino?',
        'Qual è il conflitto politico dell\'epoca?',
        'Quale usanza d\'epoca è simbolica?'
    ],
    'Horror': [
        'Qual è l\'origine del male?',
        'Qual è la paura ancestrale che vuoi esplorare?',
        'Perché i protagonisti non possono fuggire?',
        'Qual è il sacrificio necessario?'
    ],
    'Saggio': [
        'Qual è il problema principale che vuoi analizzare?',
        'Qual è la tesi rivoluzionaria che sosterrai?',
        'A quale pubblico specifico ti rivolgi?',
        'Quale caso studio è fondamentale?'
    ],
    'Giallo': [
        'Chi è la vittima e in quali circostanze è morta?',
        'Qual è il metodo unico dell\'investigatore?',
        'Chi sono i tre sospettati principali?',
        'Qual è il dettaglio minimo che risolverà il caso?'
    ]
};

const DEFAULT_QUESTIONS = [
    'Qual è il tema principale della tua storia?',
    'Chi è il protagonista e cosa desidera?',
    'Qual è il conflitto principale?',
    'Come vorresti che finisse la storia?'
];

const ConceptPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [bookTitle, setBookTitle] = useState<string | null>(null);
    const [genre, setGenre] = useState<string | null>(null);
    const [answers, setAnswers] = useState<string[]>(['', '', '', '']);

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (bookId) {
            fetchBookData();
        }
    }, [bookId]);

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
        } catch (err) {
            console.error(err);
        }
    };

    const handleGenerateConcepts = async () => {
        setLoading(true);
        const bookId = localStorage.getItem('active_book_id');

        const questions = QUESTIONS_BY_GENRE[genre || ''] || DEFAULT_QUESTIONS;
        const context = questions.map((q, i) => `D: ${q}\nR: ${answers[i]}`).join('\n\n');

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

    const questions = QUESTIONS_BY_GENRE[genre || ''] || DEFAULT_QUESTIONS;
    const isComplete = answers.every(a => a.trim().length > 0);

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', minHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

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
                                <textarea
                                    value={answers[i]}
                                    onChange={(e) => handleAnswerChange(i, e.target.value)}
                                    placeholder="Scrivi qui la tua idea..."
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        resize: 'none',
                                        background: 'rgba(0, 0, 0, 0.2)',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        borderRadius: '16px',
                                        padding: '1.2rem',
                                        fontSize: '1rem',
                                        lineHeight: 1.5
                                    }}
                                />
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