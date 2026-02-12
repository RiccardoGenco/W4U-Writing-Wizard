import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, ChevronRight, Loader2, Wand2, Download, CheckCircle } from 'lucide-react';
import { supabase, logDebug, callBookAgent } from '../../lib/api';
import { motion } from 'framer-motion';

const CoverPage: React.FC = () => {
    const navigate = useNavigate();
    const [generating, setGenerating] = useState(false);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [bookTitle, setBookTitle] = useState('');
    const [bookAuthor, setBookAuthor] = useState('');
    const [mood, setMood] = useState('captivating and professional');
    const [style, setStyle] = useState('modern literary fiction');
    const [loading, setLoading] = useState(true);
    const [progressStage, setProgressStage] = useState<string>('');

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (!bookId) {
            setLoading(false);
            return;
        }
        fetchBookData();

        // Realtime subscription for async cover generation
        const channel = supabase
            .channel(`book-cover-${bookId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'books',
                    filter: `id=eq.${bookId}`
                },
                (payload: any) => {
                    const newBook = payload.new;
                    if (newBook.cover_url && newBook.cover_url !== coverUrl) {
                        setCoverUrl(newBook.cover_url);
                        setGenerating(false);
                        logDebug('frontend', 'cover_generation_realtime_received', { url: newBook.cover_url }, bookId);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [bookId, coverUrl]);

    const fetchBookData = async () => {
        try {
            const { data, error } = await supabase
                .from('books')
                .select('title, author, cover_url, genre, context_data')
                .eq('id', bookId)
                .single();

            if (error) throw error;
            if (data) {
                setBookTitle(data.title || 'Il tuo libro');
                setBookAuthor(data.author || 'Autore');
                if (data.cover_url) {
                    setCoverUrl(data.cover_url);
                }

                // Try to extract mood/style from blueprint if present
                const blueprint = data.context_data?.blueprint;
                if (blueprint) {
                    if (blueprint.plot_vibes) setMood(blueprint.plot_vibes);
                }

                // Set default style based on genre
                const genreStyles: Record<string, string> = {
                    'Thriller': 'dark suspenseful cinematic',
                    'Noir': 'high-contrast black and white grit',
                    'Fantasy': 'epic high-fantasy digital art',
                    'Romanzo Rosa': 'soft romantic pastel watercolor',
                    'Fantascienza': 'futuristic neon sci-fi concept art',
                    'Horror': 'eerie macabre gothic',
                    'Giallo': 'classic detective mystery illustration'
                };
                if (data.genre && genreStyles[data.genre]) {
                    setStyle(genreStyles[data.genre]);
                }
            }
        } catch (err) {
            console.error('Error fetching book data:', err);
        } finally {
            setLoading(false);
        }
    };

    const generateCover = async () => {
        if (!bookId) return;

        setGenerating(true);
        setProgressStage('Analisi blueprint e preparazione prompt...');
        const startTime = performance.now();
        try {
            await logDebug('frontend', 'cover_generation_start', {
                bookId,
                mood,
                style,
                is_regenerate: !!coverUrl
            }, bookId);

            // Call the book agent to generate cover
            setProgressStage('Generazione immagine con DALL-E 3 (può richiedere fino a 30s)...');
            const response = await callBookAgent('GENERATE_COVER', {
                title: bookTitle,
                author: bookAuthor,
                mood: mood,
                style: style
            }, bookId);

            setProgressStage('Finalizzazione e salvataggio...');

            if (response && response.status === 'started') {
                console.log('Cover generation started async');
                // Do nothing, wait for Realtime
            } else if (response && response.cover_url) {
                setCoverUrl(response.cover_url);
                await supabase
                    .from('books')
                    .update({ cover_url: response.cover_url })
                    .eq('id', bookId);

                await logDebug('frontend', 'cover_generation_success_sync', {
                    bookId,
                    coverUrl: response.cover_url,
                    duration_ms: Math.round(performance.now() - startTime)
                }, bookId);
                setGenerating(false);
            }
        } catch (err: any) {
            console.error('Cover generation error:', err);
            await logDebug('frontend', 'cover_generation_error', {
                error: err.message,
                bookId,
                duration_ms: Math.round(performance.now() - startTime)
            }, bookId);
            alert('Errore durante la generazione della copertina. Riprova.');
            setGenerating(false);
        }
    };

    const proceedToExport = async () => {
        if (bookId) {
            await supabase.from('books').update({ status: 'EXPORT' }).eq('id', bookId);
        }
        navigate('/create/export');
    };

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" />
            </div>
        );
    }

    return (
        <div className="container-narrow fade-in" style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Genera la Copertina</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.2rem' }}>
                Crea una copertina professionale per il tuo libro prima dell'export.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', maxWidth: '900px', margin: '0 auto' }}>
                {/* Left: Cover Preview */}
                <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>Anteprima Copertina</h3>

                    {coverUrl ? (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            style={{
                                width: '280px',
                                height: '420px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}
                        >
                            <img
                                src={coverUrl}
                                alt="Copertina del libro"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </motion.div>
                    ) : (
                        <div style={{
                            width: '280px',
                            height: '420px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #0f172a 100%)',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            textAlign: 'center',
                            padding: '2rem'
                        }}>
                            <Image size={64} style={{ marginBottom: '1rem', opacity: 0.7 }} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{bookTitle}</h2>
                            <p style={{ fontSize: '1rem', opacity: 0.8 }}>di {bookAuthor}</p>
                        </div>
                    )}

                    {coverUrl && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginTop: '1rem',
                                color: 'var(--success)'
                            }}
                        >
                            <CheckCircle size={20} />
                            <span>Copertina generata con successo!</span>
                        </motion.div>
                    )}
                </div>

                {/* Right: Controls */}
                <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>Generazione Copertina</h3>

                        <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Atmosfera (Mood)</label>
                                <input
                                    value={mood}
                                    onChange={(e) => setMood(e.target.value)}
                                    placeholder="Es. misteriosa, epica, romantica..."
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Stile Artistico</label>
                                <input
                                    value={style}
                                    onChange={(e) => setStyle(e.target.value)}
                                    placeholder="Es. pittura a olio, minimalista, cyberpunk..."
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={generateCover}
                            disabled={generating}
                            className="btn-primary"
                            style={{ width: '100%', marginBottom: '1rem' }}
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    <span>{progressStage}</span>
                                </>
                            ) : coverUrl ? (
                                <>
                                    <Wand2 size={20} />
                                    Rigenera Copertina
                                </>
                            ) : (
                                <>
                                    <Wand2 size={20} />
                                    Genera Copertina
                                </>
                            )}
                        </button>

                        {coverUrl && (
                            <button
                                onClick={() => window.open(coverUrl, '_blank')}
                                className="btn-secondary"
                                style={{ width: '100%' }}
                            >
                                <Download size={20} />
                                Scarica Copertina
                            </button>
                        )}
                    </div>

                    <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--glass-border)' }}>
                        <button
                            onClick={proceedToExport}
                            className="btn-primary"
                            style={{ width: '100%' }}
                        >
                            Procedi all'Export
                            <ChevronRight size={20} />
                        </button>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
                            Puoi procedere all'export anche senza generare una copertina.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoverPage;
