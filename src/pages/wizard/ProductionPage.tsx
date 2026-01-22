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

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (!bookId) return;
        fetchChapters();

        // Realtime Subscription
        console.log("Subscribing to chapters for book:", bookId);
        const channel = supabase
            .channel(`chapters-changes-${bookId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'chapters',
                    filter: `book_id=eq.${bookId}`
                },
                (payload) => {
                    console.log("Realtime Update Received:", payload);
                    const updated = payload.new as DBChapter;
                    setChapters(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
                }
            )
            .subscribe((status) => {
                console.log("Subscription status:", status);
            });


        return () => {
            supabase.removeChannel(channel);
        }
    }, [bookId]);

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
        } catch (e) {
            console.error(e);
            alert("Errore avvio generazione.");
            setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'PENDING' } : c));
        }
    };

    const generateAll = async () => {
        setGlobalGenerating(true);
        for (const chap of chapters) {
            if (!chap.content || chap.status === 'PENDING') {
                await generateChapter(chap.id);
                await new Promise(r => setTimeout(r, 1000)); // Throttling
            }
        }
        setGlobalGenerating(false);
    };

    const currentChapter = chapters.find(c => c.id === selectedChapterId);

    // Calculate progress (status COMPLETED or content present)
    const completedCount = chapters.filter(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50)).length;
    const progress = (completedCount / Math.max(chapters.length, 1)) * 100;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', gap: '1rem', overflow: 'hidden' }}>

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
                                title="Aggiorna manualment"
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

                            {(!chapter.content || chapter.status === 'PENDING') && chapter.status !== 'GENERATING' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); generateChapter(chapter.id); }}
                                    className="btn-secondary"
                                    style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
                                >
                                    Genera
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                    <button
                        onClick={() => navigate('/create/editor')}
                        className="btn-primary"
                        style={{ width: '100%' }}
                    >
                        Vai all'Editor <ChevronRight size={18} />
                    </button>
                    {/* Allow going to editor even if not finished, so user can see what's done */}
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
