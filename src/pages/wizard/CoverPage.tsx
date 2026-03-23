import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, ChevronRight, Loader2, Wand2, Download, CheckCircle } from 'lucide-react';
import { supabase, logDebug, callBookAgent } from '../../lib/api';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';

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
    const [backCoverBlurb, setBackCoverBlurb] = useState<string>('');
    const [generatingBlurb, setGeneratingBlurb] = useState(false);

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
                
                if (data.context_data?.back_cover_blurb) {
                    setBackCoverBlurb(data.context_data.back_cover_blurb);
                }

                // Try to extract mood/style from blueprint if present
                const blueprint = data.context_data?.blueprint;
                if (blueprint) {
                    if (blueprint.plot_vibes) setMood(blueprint.plot_vibes);
                }

                // Set default style based on genre
                const genreStyles: Record<string, string> = {
                    'Giallo e Thriller': 'dark suspenseful cinematic mystery',
                    'Fantasy': 'epic high-fantasy digital art magical',
                    'Romance': 'soft romantic pastel watercolor emotion',
                    'Sci-Fi': 'futuristic neon sci-fi concept art high-tech',
                    'Horror': 'eerie macabre gothic horror dark',
                    'Storico': 'historical oil painting realistic vintage',
                    'Young Adult': 'modern vibrant digital notebook style',
                    'Distopico': 'grim dystopian cyberpunk oppressive atmosphere',
                    'Avventura': 'action dynamic landscape cinematic lighting',
                    'Business & Self-Help': 'minimalist clean professional corporate',
                    'Salute, Dieta e Benessere': 'fresh organic bright natural photography',
                    'Finanza Personale e Investimenti': 'professional data-driven clean geometric',
                    'Hobby e Passioni': 'warm inviting detailed hobbyist workshop',
                    'Spiritualità e New Age': 'ethereal spiritual mystical light nebula',
                    'Relazioni e Parenting': 'warm family connection emotional photography',
                    'Tecnologia e AI': 'digital circuit abstract modern tech neural',
                    'Viaggi e Guide di Nicchia': 'travel photography scenic landscape vivid',
                    'Biografie e Memorie': 'black and white portrait classic elegant',
                    'Saggistica Scientifica o Storica': 'educational schematic detailed illustration'
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

    const generateBackCoverBlurb = async () => {
        if (!bookId) return;
        setGeneratingBlurb(true);
        try {
            await logDebug('frontend', 'back_cover_blurb_generation_start', { bookId }, bookId);

            const response = await callBookAgent('GENERATE_BACK_COVER_BLURB', {
                title: bookTitle,
                author: bookAuthor,
                synopsis: '' // Will be handled by agent using book context
            }, bookId);

            if (response && response.blurb) {
                setBackCoverBlurb(response.blurb);

                // Save to context_data
                const { data: bookData } = await supabase
                    .from('books')
                    .select('context_data')
                    .eq('id', bookId)
                    .single();

                const updatedContext = {
                    ...(bookData?.context_data || {}),
                    back_cover_blurb: response.blurb
                };

                await supabase
                    .from('books')
                    .update({ context_data: updatedContext })
                    .eq('id', bookId);

                await logDebug('frontend', 'back_cover_blurb_generation_success', { bookId }, bookId);
            }
        } catch (err: any) {
            console.error('Blurb generation error:', err);
            alert('Errore durante la generazione della quarta di copertina. Riprova.');
        } finally {
            setGeneratingBlurb(false);
        }
    };

    const downloadCombinedCover = async () => {
        const ebookElement = document.getElementById('ebook-export-node');
        const paperbackElement = document.getElementById('paperback-export-node');
        if (!ebookElement || !paperbackElement) return;

        if (!confirm('Verranno scaricati due file ad alta risoluzione (eBook e Cartaceo). Il processo potrebbe richiedere alcuni secondi, procedere?')) return;

        try {
            // Genera eBook
            const canvasEbook = await html2canvas(ebookElement, {
                useCORS: true,
                scale: 1 // Già ad alta risoluzione in px assoluti (1749x2481)
            });
            const linkEbook = document.createElement('a');
            linkEbook.download = `${bookTitle.replace(/\\s+/g, '_')}_Ebook.png`;
            linkEbook.href = canvasEbook.toDataURL('image/png');
            linkEbook.click();

            // Attesa minima per browser stress
            await new Promise(res => setTimeout(res, 1000));

            // Genera Cartaceo (3688x2556)
            const canvasPaperback = await html2canvas(paperbackElement, {
                useCORS: true,
                scale: 1 
            });
            const linkPaperback = document.createElement('a');
            linkPaperback.download = `${bookTitle.replace(/\\s+/g, '_')}_Cartaceo.png`;
            linkPaperback.href = canvasPaperback.toDataURL('image/png');
            linkPaperback.click();

        } catch (err) {
            console.error('Error generating cover images:', err);
            alert('Errore durante il salvataggio delle copertine. Prova a scaricare da un PC con più memoria RAM.');
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
                            id="cover-export-node"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            style={{
                                width: '280px',
                                height: '420px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                position: 'relative'
                            }}
                        >
                            <img
                                src={coverUrl}
                                crossOrigin="anonymous"
                                alt="Copertina del libro"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {/* Text Mask Overlay */}
                            <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '2rem 1.5rem',
                                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.8) 100%)',
                                color: 'white',
                                textAlign: 'center'
                            }}>
                                <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', textShadow: '2px 2px 4px rgba(0,0,0,0.8)', margin: 0 }}>
                                    {bookTitle}
                                </h1>
                                <p style={{ fontSize: '1rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '2px', textShadow: '1px 1px 3px rgba(0,0,0,0.8)', margin: 0 }}>
                                    {bookAuthor}
                                </p>
                            </div>
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
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button
                                    onClick={downloadCombinedCover}
                                    className="btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    <Download size={20} />
                                    Scarica
                                </button>
                                <button
                                    onClick={generateBackCoverBlurb}
                                    disabled={generatingBlurb}
                                    className="btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    {generatingBlurb ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
                                    Genera Quarta
                                </button>
                            </div>
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

            {/* OFF-SCREEN NODES FOR HIGH-RES EXPORT */}
            {coverUrl && (
                <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', zIndex: -1 }}>
                    {/* EBOOK EXPORT NODE */}
                    <div id="ebook-export-node" style={{
                        width: '1749px',
                        height: '2481px',
                        position: 'relative',
                        backgroundColor: '#000'
                    }}>
                        <img src={coverUrl} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Background" />
                        <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '200px 150px',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.8) 100%)',
                            color: 'white',
                            textAlign: 'center'
                        }}>
                            <h1 style={{ fontSize: '150px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '5px', textShadow: '10px 10px 20px rgba(0,0,0,0.8)', margin: 0 }}>
                                {bookTitle}
                            </h1>
                            <p style={{ fontSize: '80px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '10px', textShadow: '5px 5px 15px rgba(0,0,0,0.8)', margin: 0 }}>
                                {bookAuthor}
                            </p>
                        </div>
                    </div>

                    {/* PAPERBACK EXPORT NODE */}
                    <div id="paperback-export-node" style={{
                        width: '3688px',
                        height: '2556px',
                        position: 'relative',
                        backgroundColor: '#1a1a2e', // Tinta unita scura per il retro e il dorso
                        fontFamily: 'sans-serif'
                    }}>
                        {/* Front Cover Area (Lato Destro) */}
                        <div style={{
                            position: 'absolute',
                            top: '37.5px', // Bleed top
                            left: '1901.5px', // Spine end (37.5 + 1749 + 115)
                            width: '1749px',
                            height: '2481px'
                        }}>
                            <img src={coverUrl} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Front" />
                            <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '200px 150px',
                                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.8) 100%)',
                                color: 'white',
                                textAlign: 'center'
                            }}>
                                <h1 style={{ fontSize: '150px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '5px', textShadow: '10px 10px 20px rgba(0,0,0,0.8)', margin: 0 }}>
                                    {bookTitle}
                                </h1>
                                <p style={{ fontSize: '80px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '10px', textShadow: '5px 5px 15px rgba(0,0,0,0.8)', margin: 0 }}>
                                    {bookAuthor}
                                </p>
                            </div>
                        </div>

                        {/* Dorso (Spine) Centrale */}
                        <div style={{
                            position: 'absolute',
                            top: '37.5px',
                            left: '1786.5px',
                            width: '115px',
                            height: '2481px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(0,0,0,0.2)', // Opzionale ombreggiatura
                        }}>
                            <span style={{ 
                                color: 'white', 
                                fontSize: '60px', 
                                fontWeight: 'bold', 
                                textTransform: 'uppercase',
                                letterSpacing: '8px',
                                transform: 'rotate(90deg)',
                                whiteSpace: 'nowrap'
                            }}>
                                {bookTitle} • {bookAuthor}
                            </span>
                        </div>

                        {/* Back Cover Area (Lato Sinistro) */}
                        <div style={{
                            position: 'absolute',
                            top: '37.5px',
                            left: '37.5px',
                            width: '1749px',
                            height: '2481px',
                            padding: '200px 150px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            color: 'white',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ textAlign: 'center', opacity: 0.85 }}>
                                <p style={{ fontStyle: 'italic', fontSize: '80px', marginBottom: '100px', fontWeight: '300' }}>
                                    Un'opera straordinaria ti attende...
                                </p>
                                <p style={{ fontSize: '60px', lineHeight: '1.8', textAlign: 'left', fontWeight: '400' }}>
                                    {backCoverBlurb || (
                                        <>
                                            Preparati a immergerti tra le pagine di `{bookTitle}`. Un'avventura straordinaria che esplora, tra le righe, temi profondi e universali con uno stile narrativo inimitabile e coinvolgente. 
                                            Scopri i dettagli minuziosi e le sfumature che rendono questo libro una lettura assolutamente imperdibile per tutti gli appassionati del genere. 
                                            Attraverso una prosa curata e una trama avvincente, l'autore ci conduce in un viaggio emozionante che rimarrà impresso nella memoria del lettore molto tempo dopo aver chiuso l'ultima pagina.
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Barcode Placeholder (2.000" x 1.200" => 600px x 360px) in basso a destra del retro copertina */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                                <div style={{
                                    width: '600px',
                                    height: '360px',
                                    backgroundColor: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px'
                                }}>
                                    {/* Barcode area pure white as requested */}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoverPage;
