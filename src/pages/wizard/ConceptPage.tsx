import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2, Upload, FileText, User, AlertCircle } from 'lucide-react';
import { callBookAgent, supabase, logDebug } from '../../lib/api';
import { getQuestionsForGenre } from '../../data/genres';
import mammoth from 'mammoth';

interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string;
}


const CONCEPT_LOADING_PHASES = [
    'Analisi delle tue risposte...',
    'Lettura dei materiali caricati...',
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

    // New State for Phase 1
    const [authorName, setAuthorName] = useState('');
    const [pseudonym, setPseudonym] = useState('');
    const [uploadedFileContent, setUploadedFileContent] = useState<string>('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

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
        const { data } = await supabase.from('books').select('title, genre, context_data, author').eq('id', bookId).single();
        if (data) {
            setBookTitle(data.title);
            setGenre(data.genre);
            setAuthorName(data.author || '');
            if (data.context_data?.answers) {
                setAnswers(data.context_data.answers);
            }
            if (data.context_data?.pseudonym) {
                setPseudonym(data.context_data.pseudonym);
            }
            // If we stored file content previously, retrieve (optional, might be too heavy for DB context_data, better to just keep in UI state if navigating back)
        }
    };

    const handleAnswerChange = (index: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileError(null);
        setIsAnalyzingFile(true);
        setFileName(file.name);

        try {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                throw new Error('Il file è troppo grande. Max 5MB.');
            }

            let text = '';
            if (file.name.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                text = result.value;
                if (result.messages.length > 0) {
                    console.warn('Mammoth messages:', result.messages);
                }
            } else if (file.name.endsWith('.txt')) {
                text = await file.text();
            } else {
                throw new Error('Formato non supportato. Usa .docx o .txt');
            }

            // Basic check for length (approx 150 pages ~ 60k words ~ 400k chars)
            if (text.length > 500000) {
                throw new Error('Il testo è troppo lungo (Max 150 pagine circa).');
            }

            setUploadedFileContent(text);
            await logDebug('frontend', 'file_uploaded', { fileName: file.name, length: text.length }, bookId);

        } catch (err: any) {
            console.error(err);
            setFileError(err.message);
            setFileName(null);
            setUploadedFileContent('');
        } finally {
            setIsAnalyzingFile(false);
        }
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
                    author: authorName || 'Autore Sconosciuto', // Save Author Name
                    context_data: {
                        ...currentContext,
                        selected_concept: concept,
                        answers: answers,
                        pseudonym: pseudonym,
                        uploaded_materials_summary: uploadedFileContent ? 'Materiale caricato presente' : 'Nessun materiale'
                        // We do NOT save the full text in context_data to avoid DB bloat, it was sent to AI agent already
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
        const interviewContext = questions.map((q, i) => `D: ${q}\nR: ${answers[i]}`).join('\n\n');

        let fullContext = `INTERVISTA:\n${interviewContext}`;

        if (authorName) fullContext += `\n\nNOME AUTORE: ${authorName}`;
        if (pseudonym) fullContext += `\nPSEUDONIMO: ${pseudonym}`;

        if (uploadedFileContent) {
            fullContext += `\n\n=== MATERIALE AGGIUNTIVO CARICATO DALL'UTENTE (BOZZE/APPUNTI) ===\n${uploadedFileContent}\n=== FINE MATERIALE AGGIUNTIVO ===\n\nISTRUZIONI: Dai MOLTO peso al materiale caricato. Usalo come base fondamentale per lo stile e i contenuti.`;
        }

        await logDebug('frontend', 'concept_generation_start', {
            genre,
            inputs_length: fullContext.length,
            has_file: !!uploadedFileContent
        }, bookId);

        const startTime = performance.now();

        try {
            // Update book author immediately
            if (bookId && authorName) {
                await supabase.from('books').update({ author: authorName }).eq('id', bookId);
            }

            const data = await callBookAgent('GENERATE_CONCEPTS', { userInput: fullContext, title: bookTitle }, bookId);
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
    // Require answers OR a file upload with substantial content. 
    // User policy: "Upload does not exempt from questions", BUT maybe relax if file is huge? 
    // "L'eventuale upload del word non esime l'utente dalla fase delle domande." -> OK, keep mandatory questions.
    const isComplete = answeredCount >= 4 && !!authorName; // Added authorName requirement? Let's make it optional or mandatory. "bisogna anche chiedere nome e cognome". Let's make it mandatory.

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
                    Rispondi ad almeno 4 domande chiave e carica i tuoi bozzetti per permettere all'IA di generare la struttura del tuo libro.
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

                    {/* SEZIONE DATI AUTORE */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel"
                        style={{ padding: '2rem', borderLeft: '4px solid var(--primary)' }}
                    >
                        <h4 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={20} color="var(--primary)" />
                            Dati Autore
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nome Completo (obbligatorio)</label>
                                <input
                                    type="text"
                                    value={authorName}
                                    onChange={(e) => setAuthorName(e.target.value)}
                                    placeholder="Es. Mario Rossi"
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: 'var(--text-main)'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Pseudonimo (opzionale)</label>
                                <input
                                    type="text"
                                    value={pseudonym}
                                    onChange={(e) => setPseudonym(e.target.value)}
                                    placeholder="Es. J.K. Writer"
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: 'var(--text-main)'
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* SEZIONE UPLOAD MATERIALI */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-panel"
                        style={{ padding: '2rem', borderLeft: '4px solid var(--accent)' }}
                    >
                        <h4 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={20} color="var(--accent)" />
                            Materiali e Bozze (Opzionale)
                        </h4>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                            Carica un file Word (.docx) o testo (.txt) con appunti, storie personali, o bozze.
                            L'IA userà questi contenuti per personalizzare il libro. Max 150 pagine (5MB).
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.8rem',
                                background: 'rgba(255,255,255,0.05)',
                                padding: '1rem 2rem',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                border: '1px dashed rgba(255,255,255,0.2)',
                                transition: 'all 0.2s ease'
                            }}>
                                <Upload size={20} />
                                <span>{fileName || 'Seleziona File Word/Txt'}</span>
                                <input
                                    type="file"
                                    accept=".docx,.txt"
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                    disabled={isAnalyzingFile}
                                />
                            </label>

                            {isAnalyzingFile && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                    <Loader2 className="animate-spin" size={18} />
                                    <span>Analisi file...</span>
                                </div>
                            )}

                            {fileError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)' }}>
                                    <AlertCircle size={18} />
                                    <span>{fileError}</span>
                                </div>
                            )}

                            {fileName && !isAnalyzingFile && !fileError && (
                                <span style={{ color: 'var(--success)', fontWeight: 600 }}>File caricato e pronto!</span>
                            )}
                        </div>
                    </motion.div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {questions.map((q, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + (i * 0.1) }}
                                className="glass-panel"
                                style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{
                                        width: '32px',
                                        height: '32px',
                                        minWidth: '32px',
                                        minHeight: '32px',
                                        flexShrink: 0,
                                        aspectRatio: '1 / 1',
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
                                Rispondi ad almeno 4 domande e inserisci il nome autore per procedere
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConceptPage;