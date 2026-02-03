import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, Loader2, FileText, ChevronRight } from 'lucide-react';
import { marked } from 'marked';
import { callBookAgent, supabase } from '../../lib/api';

// We need to fetch the real ID from DB mostly, but since we inserted them we can rely on order or re-fetch.
interface DBChapter {
    id: string; // UUID from DB
    title: string;
    summary: string;
    content: string | null;
    status: string;
}

const ProductionPage: React.FC = () => {
    const navigate = useNavigate();

    const [chapters, setChapters] = useState<DBChapter[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [globalGenerating, setGlobalGenerating] = useState(false);

    // Stati per l'overlay di caricamento
    const [loadingMessage, setLoadingMessage] = useState("Analisi del blueprint narrativo...");
    const [loadingSubMessage, setLoadingSubMessage] = useState("");

    const loadingPhases = [
        "Analisi del blueprint narrativo...",
        "Sviluppo personaggi...",
        "Costruzione ambientazione...",
        "Scrittura dialoghi...",
        "Controllo coerenza...",
        "Revisione grammaticale...",
        "Finalizzazione capitoli..."
    ];

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (!bookId) return;
        fetchChapters();

        // Realtime Subscription with better error handling
        console.log("Subscribing to chapters for book:", bookId);
        const channel = supabase
            .channel(`chapters-changes-${bookId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chapters',
                    filter: `book_id=eq.${bookId}`
                },
                (payload) => {
                    console.log("Realtime Update Received:", payload);
                    if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as DBChapter;
                        setChapters(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
                    }
                }
            )
            .subscribe((status) => {
                console.log("Subscription status:", status);
                if (status === 'SUBSCRIBED') {
                    console.log("Realtime subscription active for book:", bookId);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error("Realtime subscription error - falling back to polling");
                    // Fallback to polling every 10 seconds
                    const interval = setInterval(fetchChapters, 10000);
                    return () => clearInterval(interval);
                }
            });


        return () => {
            supabase.removeChannel(channel);
        }
    }, [bookId]);

    // Effect per far cambiare i messaggi durante la generazione
    useEffect(() => {
        if (!globalGenerating) return;

        let phaseIndex = 0;
        setLoadingMessage(loadingPhases[0]);
        setLoadingSubMessage(`Preparazione generazione ${chapters.length} capitoli...`);

        const interval = setInterval(() => {
            phaseIndex = (phaseIndex + 1) % loadingPhases.length;
            setLoadingMessage(loadingPhases[phaseIndex]);

            // Calcola capitoli completati vs totali per la sottostringa
            const completed = chapters.filter(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50)).length;
            setLoadingSubMessage(`Progresso: ${completed}/${chapters.length} capitoli completati`);
        }, 2500); // Cambia messaggio ogni 2.5 secondi

        return () => clearInterval(interval);
    }, [globalGenerating, chapters]);

    const fetchChapters = async () => {
        const { data, error } = await supabase
            .from('chapters')
            .select('*')
            .eq('book_id', bookId)
            .order('chapter_number', { ascending: true });

        if (error) console.error(error);
        if (data) {
            setChapters(data);
            if (data.length > 0 && !selectedChapterId) setSelectedChapterId(data[0].id);
        }
    };

    const generateChapter = async (id: string) => {
        // Optimistic update
        setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'GENERATING' } : c));

        try {
            await callBookAgent('WRITE', {
                chapterId: id
            }, bookId);

            // n8n will update the DB, which triggers Realtime update
            // Fallback: poll for updates after delay
            setTimeout(() => {
                fetchChapters();
            }, 5000); // Check after 5 seconds
        } catch (e) {
            console.error(e);
            alert("Errore avvio generazione.");
            setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'PENDING' } : c));
        }
    };

    const checkChapterCompletion = async (id: string) => {
        const { data } = await supabase
            .from('chapters')
            .select('status, content')
            .eq('id', id)
            .single();
        return data?.status === 'COMPLETED' || (data?.content && data.content.length > 50);
    };

    const generateAll = async () => {
        setGlobalGenerating(true);

        // Prendiamo l'elenco aggiornato dei capitoli che hanno bisogno di generazione
        const toGenerate = chapters.filter(c => !c.content || c.status === 'PENDING' || c.status === 'ERROR');

        for (const chap of toGenerate) {
            // Verifica di sicurezza prima di lanciare: se è già stato generato (magari da n8n in parallelo) saltiamo
            const alreadyDone = await checkChapterCompletion(chap.id);
            if (alreadyDone) continue;

            // Avviamo la generazione del capitolo
            await generateChapter(chap.id);

            // Attendiamo che il capitolo sia completato prima di passare al prossimo
            let isDone = false;
            let attempts = 0;
            const maxAttempts = 60; // Timeout di sicurezza (es. 5 min se polled ogni 5s)

            while (!isDone && attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 5000)); // Poll ogni 5 secondi
                isDone = await checkChapterCompletion(chap.id);
                attempts++;

                // Aggiorniamo la lista locale per mostrare il progresso all'utente
                if (isDone) fetchChapters();
            }
        }

        setGlobalGenerating(false);
        fetchChapters(); // Sync finale
    };

    const currentChapter = chapters.find(c => c.id === selectedChapterId);

    // Calculate progress (status COMPLETED or content present)
    const completedCount = chapters.filter(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50)).length;
    const progress = (completedCount / Math.max(chapters.length, 1)) * 100;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', gap: '1rem', overflow: 'hidden' }}>

            {/* OVERLAY GENERAZIONE */}
            {globalGenerating && (
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
                            {loadingSubMessage}
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
                        Non chiudere questa finestra. L'IA sta scrivendo il tuo libro.
                    </p>
                </div>
            )}

            {/* Left Panel: Chapter List */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '90vh' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Produzione</h2>
                    <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{completedCount} / {chapters.length} completati</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                                onClick={fetchChapters}
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                title="Aggiorna manualmente"
                            >
                                <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                            </button>
                            <button
                                onClick={generateAll}
                                disabled={globalGenerating || completedCount === chapters.length}
                                className="btn-primary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            >
                                <Play size={14} /> Genera Tutto
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {chapters.map(chapter => (
                        <div
                            key={chapter.id}
                            onClick={() => setSelectedChapterId(chapter.id)}
                            style={{
                                padding: '1rem',
                                marginBottom: '0.8rem',
                                borderRadius: '12px',
                                background: selectedChapterId === chapter.id ? 'rgba(79, 70, 229, 0.1)' : 'rgba(255,255,255,0.03)',
                                border: selectedChapterId === chapter.id ? '1px solid var(--primary)' : '1px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{chapter.title}</span>
                                {(chapter.status === 'COMPLETED' || (chapter.content && chapter.content.length > 50)) && <CheckCircle2 size={16} color="var(--success)" />}
                                {chapter.status === 'GENERATING' && <Loader2 size={16} className="animate-spin" color="var(--accent)" />}
                            </div>


                        </div>
                    ))}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                    <button
                        onClick={async () => {
                            if (bookId) {
                                await supabase.from('books').update({ status: 'COVER' }).eq('id', bookId);
                            }
                            navigate('/create/cover');
                        }}
                        className="btn-primary"
                        style={{ width: '100%' }}
                    >
                        Genera Copertina <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Right Panel: Preview */}
            <div className="glass-panel" style={{ height: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <FileText size={20} color="var(--text-muted)" />
                    <span style={{ fontWeight: 600 }}>Anteprima: {currentChapter?.title}</span>
                </div>

                <div style={{ padding: '2rem', flex: 1, overflowY: 'auto', background: 'rgba(15, 23, 42, 0.3)' }}>
                    {currentChapter?.content ? (
                        <div className="markdown-content" dangerouslySetInnerHTML={{ __html: marked.parse(currentChapter.content) as string }} />
                    ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            {currentChapter?.status === 'GENERATING' ? (
                                <><Loader2 size={40} className="animate-spin" style={{ marginBottom: '1rem' }} /> Scrittura in corso...</>
                            ) : (
                                <><p>Il contenuto apparirà qui.</p></>
                            )}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default ProductionPage;