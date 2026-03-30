import React, { useState, useEffect } from 'react';
import { 
    Image as ImageIcon, 
    Loader2, 
    Wand2, 
    Download, 
    CheckCircle,
    Lock, 
    FileText, 
    Smartphone,
    RotateCcw,
    Zap,
    BookOpen
} from 'lucide-react';
import { supabase, logDebug, callBookAgent } from '../../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

// --- Export Config (from legacy ExportPage) ---
type ExportOption = {
    id: string;
    endpoint: '/export/pdf' | '/export/epub' | '/export/docx';
    format: 'PDF' | 'EPUB' | 'DOCX';
    edition: 'ebook' | 'paperback';
    icon: typeof FileText;
    title: string;
    label: string;
    filename: (bookId: string) => string;
    progress: string;
};

const EXPORT_OPTIONS: ExportOption[] = [
    {
        id: 'DOCX_EBOOK',
        endpoint: '/export/docx',
        format: 'DOCX',
        edition: 'ebook',
        icon: FileText,
        title: 'Word eBook',
        label: 'Word per eBook',
        filename: (bookId) => `libro_${bookId}_ebook.docx`,
        progress: 'Il server sta preparando il Word per eBook...'
    },
    {
        id: 'EPUB_EBOOK',
        endpoint: '/export/epub',
        format: 'EPUB',
        edition: 'ebook',
        icon: Smartphone,
        title: 'EPUB eBook',
        label: 'EPUB senza copertina',
        filename: (bookId) => `libro_${bookId}.epub`,
        progress: "Il server sta preparando l'EPUB senza copertina..."
    },
    {
        id: 'PDF_EBOOK',
        endpoint: '/export/pdf',
        format: 'PDF',
        edition: 'ebook',
        icon: FileText,
        title: 'PDF eBook',
        label: 'PDF con copertina front',
        filename: (bookId) => `libro_${bookId}_ebook.pdf`,
        progress: 'Il server sta impaginando il PDF eBook...'
    },
    {
        id: 'DOCX_PAPERBACK',
        endpoint: '/export/docx',
        format: 'DOCX',
        edition: 'paperback',
        icon: FileText,
        title: 'Word Cartaceo',
        label: 'Word con blank page, numeri pagina, fronte e retro',
        filename: (bookId) => `libro_${bookId}_cartaceo.docx`,
        progress: 'Il server sta preparando il Word per il cartaceo...'
    }
];

const FinalizePage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingBlurb, setGeneratingBlurb] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportFinished, setExportFinished] = useState(false);
    const [progressStage, setProgressStage] = useState<string>('');
    const [exportProgress, setExportProgress] = useState<string>('');
    const [selectedExportFormat, setSelectedExportFormat] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Book State
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [bookTitle, setBookTitle] = useState('');
    const [bookAuthor, setBookAuthor] = useState('');
    const [mood, setMood] = useState('captivating and professional');
    const [style, setStyle] = useState('modern literary fiction');
    const [backCoverBlurb, setBackCoverBlurb] = useState<string>('');
    const [plotSummary, setPlotSummary] = useState<string>('');
    
    // UI State
    const [isFlipped, setIsFlipped] = useState(false);

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (!bookId) {
            setLoading(false);
            return;
        }
        fetchBookData();

        const channel = supabase
            .channel(`book-finalize-${bookId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'books', filter: `id=eq.${bookId}` },
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

        return () => { supabase.removeChannel(channel); };
    }, [bookId, coverUrl]);

    const fetchBookData = async () => {
        try {
            const { data, error } = await supabase
                .from('books')
                .select('title, author, cover_url, genre, context_data, plot_summary')
                .eq('id', bookId)
                .single();

            if (error) throw error;
            if (data) {
                setBookTitle(data.title || 'Il tuo libro');
                setBookAuthor(data.author || 'Autore');
                setPlotSummary(data.plot_summary || '');
                setCoverUrl(data.cover_url);
                if (data.context_data?.back_cover_blurb) {
                    setBackCoverBlurb(data.context_data.back_cover_blurb);
                }

                // Default style based on genre
                const genreStyles: Record<string, string> = {
                    'Giallo e Thriller': 'dark suspenseful cinematic mystery',
                    'Fantasy': 'epic high-fantasy digital art magical',
                    'Romance': 'soft romantic pastel watercolor emotion',
                    'Sci-Fi': 'futuristic neon sci-fi concept art high-tech'
                };
                if (data.genre && genreStyles[data.genre]) setStyle(genreStyles[data.genre]);
            }
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const generateCover = async () => {
        if (!bookId) return;
        setGenerating(true);
        setProgressStage('Analisi e prompt...');
        try {
            const response = await callBookAgent('GENERATE_COVER', {
                title: bookTitle, author: bookAuthor, mood, style
            }, bookId);

            if (response && response.cover_url) {
                setCoverUrl(response.cover_url);
                await supabase.from('books').update({ cover_url: response.cover_url }).eq('id', bookId);
                setGenerating(false);
            }
        } catch (err) {
            console.error(err);
            setGenerating(false);
        }
    };

    const generateBlurb = async () => {
        if (!bookId) return;
        setGeneratingBlurb(true);
        try {
            const response = await callBookAgent('GENERATE_BACK_COVER_BLURB', {
                title: bookTitle, author: bookAuthor, synopsis: plotSummary
            }, bookId);

            if (response && response.blurb) {
                setBackCoverBlurb(response.blurb);
                const { data } = await supabase.from('books').select('context_data').eq('id', bookId).single();
                const updatedContext = { ...(data?.context_data || {}), back_cover_blurb: response.blurb };
                await supabase.from('books').update({ context_data: updatedContext }).eq('id', bookId);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setGeneratingBlurb(false);
        }
    };

    const handleExport = async () => {
        if (!selectedExportFormat || !bookId) return;
        setErrorMsg(null);
        const option = EXPORT_OPTIONS.find(o => o.id === selectedExportFormat);
        if (!option) return;

        setExporting(true);
        setExportProgress(option.progress);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error("Sessione scaduta.");

            const response = await fetch(option.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ bookId, edition: option.edition })
            });

            if (!response.ok) throw new Error("Errore durante la generazione.");
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = option.filename(bookId);
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setExportFinished(true);
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setExporting(false);
        }
    };

    const downloadCombinedCover = async () => {
        const ebookElement = document.getElementById('ebook-export-node');
        const paperbackElement = document.getElementById('paperback-export-node');
        if (!ebookElement || !paperbackElement) return;

        try {
            const canvasEbook = await html2canvas(ebookElement, { useCORS: true, scale: 1 });
            const linkEbook = document.createElement('a');
            linkEbook.download = `${bookTitle.replace(/\s+/g, '_')}_Ebook.png`;
            linkEbook.href = canvasEbook.toDataURL('image/png');
            linkEbook.click();

            await new Promise(res => setTimeout(res, 1000));

            const canvasPaperback = await html2canvas(paperbackElement, { useCORS: true, scale: 1 });
            const linkPaperback = document.createElement('a');
            linkPaperback.download = `${bookTitle.replace(/\s+/g, '_')}_Cartaceo.png`;
            linkPaperback.href = canvasPaperback.toDataURL('image/png');
            linkPaperback.click();
        } catch (err) {
            console.error('Error generating cover images:', err);
            alert('Errore durante il salvataggio delle copertine.');
        }
    };

    const isReadyForExport = !!(coverUrl && backCoverBlurb);

    if (loading) return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" size={48} color="var(--primary)" />
        </div>
    );

    return (
        <div className="container-narrow fade-in" style={{ padding: '2rem 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '2.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>Mastering Finale</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Definisci la veste grafica e scarica il tuo capolavoro.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 450px) 1fr', gap: '3rem' }}>
                
                {/* --- Left: Interactive Preview --- */}
                <div style={{ perspective: '1000px' }}>
                    <div style={{ position: 'sticky', top: '2rem' }}>
                        {isReadyForExport && (
                             <motion.button
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                onClick={downloadCombinedCover}
                                className="btn-secondary"
                                style={{ position: 'absolute', top: '-3rem', right: 0, fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                             >
                                <Download size={14} /> Scarica Immagini Copertina
                             </motion.button>
                        )}
                        <motion.div
                            animate={{ rotateY: isFlipped ? 180 : 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                            style={{ 
                                width: '100%', 
                                height: '580px', 
                                position: 'relative', 
                                transformStyle: 'preserve-3d',
                                cursor: 'default'
                            }}
                        >
                            {/* FRONT COVER */}
                            <div className="glass-panel" style={{ 
                                position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                                padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)',
                                boxShadow: '0 30px 60px -12px rgba(0,0,0,0.7)', borderRadius: '12px'
                            }}>
                                {coverUrl ? (
                                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                        <img src={coverUrl} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.8) 100%)',
                                            padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center', color: 'white'
                                        }}>
                                            <h2 style={{ fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase' }}>{bookTitle}</h2>
                                            <p style={{ letterSpacing: '3px', textTransform: 'uppercase', opacity: 0.9 }}>{bookAuthor}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ 
                                        width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'
                                    }}>
                                        <ImageIcon size={64} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                        <p style={{ opacity: 0.5 }}>In attesa della copertina...</p>
                                    </div>
                                )}
                            </div>

                            {/* BACK COVER (Quarta) */}
                            <div className="glass-panel" style={{ 
                                position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                                transform: 'rotateY(180deg)', background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
                                padding: '3rem 2rem', color: 'white', display: 'flex', flexDirection: 'column'
                            }}>
                                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{bookTitle}</h3>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{bookAuthor}</p>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', fontSize: '1rem', lineHeight: 1.6, opacity: 0.9 }}>
                                    {backCoverBlurb ? backCoverBlurb : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                                            <BookOpen size={48} style={{ marginBottom: '1rem' }} />
                                            <p>Quarta di copertina non ancora generata.</p>
                                        </div>
                                    )}
                                </div>
                                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                                    <div style={{ width: '120px', height: '70px', background: 'white', borderRadius: '4px' }}></div>
                                </div>
                            </div>
                        </motion.div>

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', gap: '1rem' }}>
                            <button 
                                onClick={() => setIsFlipped(!isFlipped)} 
                                className="btn-secondary" 
                                style={{ borderRadius: '30px', padding: '0.6rem 2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                            >
                                <RotateCcw size={18} /> Gira Libro
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- Right Panel: Controls & Export --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Visual Identity Section */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                            <Zap size={22} color="var(--primary)" />
                            <h3 style={{ fontSize: '1.4rem' }}>Identità Visiva</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Mood</label>
                                <input value={mood} onChange={e => setMood(e.target.value)} className="input-field" placeholder="Es. Epico, Misterioso..." />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Stile</label>
                                <input value={style} onChange={e => setStyle(e.target.value)} className="input-field" placeholder="Es. Digital Art, Olio..." />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={generateCover} disabled={generating} className="btn-primary" style={{ flex: 1.5 }}>
                                {generating ? <><Loader2 className="animate-spin" size={18} /> {progressStage}</> : <><Wand2 size={18} /> Copertina</>}
                            </button>
                            <button onClick={generateBlurb} disabled={generatingBlurb} className="btn-secondary" style={{ flex: 1 }}>
                                {generatingBlurb ? <Loader2 className="animate-spin" size={18} /> : <><Wand2 size={18} /> Quarta</>}
                            </button>
                        </div>
                    </div>

                    {/* Export Section (LOCKED) */}
                    <div className="glass-panel" style={{ 
                        padding: '2.5rem', 
                        position: 'relative',
                        minHeight: '400px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem' }}>
                            <Download size={22} color={isReadyForExport ? "var(--success)" : "var(--text-muted)"} />
                            <h3 style={{ fontSize: '1.4rem' }}>Export & Download</h3>
                        </div>

                        <div style={{ 
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem',
                            filter: isReadyForExport ? 'none' : 'blur(4px)',
                            pointerEvents: isReadyForExport ? 'auto' : 'none',
                            opacity: isReadyForExport ? 1 : 0.4,
                            transition: 'all 0.5s ease'
                        }}>
                            {EXPORT_OPTIONS.map(fmt => (
                                <div 
                                    key={fmt.id} 
                                    onClick={() => setSelectedExportFormat(fmt.id)}
                                    className="library-card" 
                                    style={{ 
                                        padding: '1.5rem', 
                                        textAlign: 'center', 
                                        cursor: 'pointer',
                                        border: selectedExportFormat === fmt.id ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                        background: selectedExportFormat === fmt.id ? 'rgba(0, 242, 255, 0.05)' : 'transparent'
                                    }}
                                >
                                    <fmt.icon size={28} color={selectedExportFormat === fmt.id ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '0.8rem' }} />
                                    <h4 style={{ fontSize: '0.9rem' }}>{fmt.title}</h4>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{fmt.label}</p>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
                            <button 
                                onClick={handleExport}
                                disabled={!selectedExportFormat || exporting || !isReadyForExport}
                                className="btn-primary" 
                                style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }}
                            >
                                {exporting ? <><Loader2 className="animate-spin" /> {exportProgress}</> : <><Download size={20} /> Scarica Manoscritto</>}
                            </button>

                            {exportFinished && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }} 
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{ marginTop: '1rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                                >
                                    <CheckCircle size={18} /> Download completato con successo!
                                </motion.div>
                            )}
                        </div>

                        {/* LOCK OVERLAY */}
                        <AnimatePresence>
                            {!isReadyForExport && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '2rem', textAlign: 'center', borderRadius: '12px', zIndex: 10
                                    }}
                                >
                                    <div style={{ 
                                        background: 'rgba(0,0,0,0.8)', padding: '2rem', borderRadius: '16px', 
                                        border: '1px solid var(--glass-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                                        maxWidth: '280px'
                                    }}>
                                        <Lock size={48} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
                                        <h4 style={{ marginBottom: '0.8rem' }}>Download Bloccato</h4>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            Genera la **copertina** e la **quarta** per abilitare i formati di export professionali.
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {errorMsg && (
                        <div className="glass-panel" style={{ padding: '1rem', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '0.9rem' }}>
                            {errorMsg}
                        </div>
                    )}
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
                        backgroundColor: '#1a1a2e',
                        fontFamily: 'sans-serif'
                    }}>
                        {/* Front Cover Area */}
                        <div style={{
                            position: 'absolute',
                            top: '37.5px',
                            left: '1901.5px',
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

                        {/* Spine Area */}
                        <div style={{
                            position: 'absolute',
                            top: '37.5px',
                            left: '1786.5px',
                            width: '115px',
                            height: '2481px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(0,0,0,0.2)',
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

                        {/* Back Cover Area */}
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
                                <p style={{ fontSize: '42px', lineHeight: '1.6', textAlign: 'left', fontWeight: '400' }}>
                                    {backCoverBlurb}
                                </p>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                                <div style={{ width: '600px', height: '360px', backgroundColor: 'white', borderRadius: '8px' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinalizePage;
