import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, callBookAgent } from '../../lib/api';
import { Loader2, CheckCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

interface Paragraph {
    id: string;
    chapter_id: string;
    paragraph_number: number;
    title: string;
    description: string;
    status: string;
}

interface Chapter {
    id: string;
    chapter_number: number;
    title: string;
    summary: string;
    paragraphs: Paragraph[];
}

const ScaffoldRevisionPage: React.FC = () => {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
    const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
    const [refreshingChapter, setRefreshingChapter] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const bookId = localStorage.getItem('active_book_id');
            if (!bookId) {
                navigate('/create/concept');
                return;
            }

            try {
                // Fetch chapters
                const { data: chaptersData, error: chaptersError } = await supabase
                    .from('chapters')
                    .select('id, chapter_number, title, summary')
                    .eq('book_id', bookId)
                    .order('chapter_number', { ascending: true });

                if (chaptersError) throw chaptersError;

                if (chaptersData && chaptersData.length > 0) {
                    const chapterIds = chaptersData.map(c => c.id);
                    // Fetch paragraphs
                    const { data: paragraphsData, error: paragraphsError } = await supabase
                        .from('paragraphs')
                        .select('id, chapter_id, paragraph_number, title, description, status')
                        .in('chapter_id', chapterIds)
                        .order('chapter_id', { ascending: true })
                        .order('paragraph_number', { ascending: true });

                    if (paragraphsError) throw paragraphsError;

                    const formattedChapters = chaptersData.map(c => ({
                        ...c,
                        paragraphs: (paragraphsData || []).filter(p => p.chapter_id === c.id)
                    }));

                    setChapters(formattedChapters);
                    if (formattedChapters.length > 0) {
                        setExpandedChapter(formattedChapters[0].id);
                    }
                }
            } catch (err) {
                console.error("Error loading scaffold data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [navigate]);

    const handleConfirm = async () => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId || chapters.length === 0) return;

        setSaving(true);
        try {
            await supabase
                .from('books')
                .update({ status: 'PRODUCTION' })
                .eq('id', bookId);

            navigate('/create/production');
        } catch (err) {
            console.error("Error updating status to production:", err);
            alert("Errore durante il passaggio alla produzione.");
            setSaving(false);
        }
    };

    const handleRegenerateChapterScaffold = async (chapterId: string) => {
        const chapter = chapters.find(c => c.id === chapterId);
        if (!chapter) return;

        const feedback = feedbacks[chapterId] || "";
        const bookId = localStorage.getItem('active_book_id');
        setRefreshingChapter(chapterId);

        try {
            const scaffoldData: any = await callBookAgent('SCAFFOLD_CHAPTER', {
                chapter: {
                    id: chapter.id,
                    title: chapter.title,
                    summary: chapter.summary,
                    currentParagraphCount: chapter.paragraphs.length
                },
                feedback: feedback
            }, bookId);

            const aiParagraphs = scaffoldData?.paragraphs || scaffoldData?.data?.paragraphs || [];

            if (Array.isArray(aiParagraphs) && aiParagraphs.length > 0) {
                // Delete old paragraphs
                await supabase.from('paragraphs').delete().eq('chapter_id', chapter.id);

                // Insert new paragraphs
                const dbParagraphs = aiParagraphs.map((p: any, pIndex: number) => ({
                    chapter_id: chapter.id,
                    paragraph_number: pIndex + 1,
                    title: p.title || `Sottocapitolo ${pIndex + 1}`,
                    description: p.description || '',
                    status: 'PENDING'
                }));

                const { data: newParagraphs, error } = await supabase
                    .from('paragraphs')
                    .insert(dbParagraphs)
                    .select('id, chapter_id, paragraph_number, title, description, status');

                if (error) throw error;

                // Update local state by merging the deeply nested structure safely
                setChapters(prev => prev.map(c =>
                    c.id === chapterId ? { ...c, paragraphs: newParagraphs || dbParagraphs as any } : c
                ));

                // Clear feedback after success
                setFeedbacks(prev => ({ ...prev, [chapterId]: '' }));
            } else {
                throw new Error("Formato IA non valido.")
            }
        } catch (err) {
            console.error("Error regenerating scaffold:", err);
            alert("Errore durante la rigenerazione. Riprova.");
        } finally {
            setRefreshingChapter(null);
        }
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: '1rem' }}>
                <Loader2 className="animate-spin text-primary" size={48} />
                <p className="text-secondary text-lg">Caricamento scaletta in corso...</p>
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Revisione Sottocapitoli</h1>
                <p className="page-subtitle">
                    Ogni capitolo è stato suddiviso nei suoi paragrafi (sottocapitoli o "pagine"). Controlla la suddivisione e chiedi all'IA di rigenerare un capitolo se desideri modificarla.
                </p>
            </header>

            <div className="accordion-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {chapters.map((chapter) => {
                    const isExpanded = expandedChapter === chapter.id;
                    const isRefreshing = refreshingChapter === chapter.id;

                    return (
                        <div key={chapter.id} className={`card ${isExpanded ? 'border-primary' : ''}`} style={{ overflow: 'hidden', padding: 0 }}>
                            <div
                                className="accordion-header"
                                onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                                style={{
                                    padding: '1.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    backgroundColor: isExpanded ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                    transition: 'background-color 0.2s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        backgroundColor: 'var(--primary)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 'bold', fontSize: '0.9rem'
                                    }}>
                                        {chapter.chapter_number}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{chapter.title}</h3>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {chapter.paragraphs.length} sottocapitoli
                                        </p>
                                    </div>
                                </div>
                                <div style={{ color: 'var(--text-secondary)' }}>
                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="accordion-content animate-slide-down" style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>

                                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                        <strong>Sommario Capitolo:</strong> {chapter.summary}
                                    </div>

                                    <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '1rem' }}>Sottocapitoli Generati:</h4>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
                                        {chapter.paragraphs.map(p => (
                                            <div key={p.id || p.paragraph_number} style={{
                                                padding: '1rem',
                                                border: '1px solid var(--border)',
                                                borderRadius: '6px',
                                                backgroundColor: 'var(--bg-primary)'
                                            }}>
                                                <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
                                                    {p.paragraph_number}. {p.title}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                                    {p.description}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="feedback-section" style={{
                                        marginTop: '1.5rem',
                                        paddingTop: '1.5rem',
                                        borderTop: '1px dashed var(--border)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.8rem'
                                    }}>
                                        <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                            Vuoi modificare la scaletta di questo capitolo?
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder="Es. 'Aggiungi una scena d'azione', 'Rimuovi il paragrafo 3'..."
                                                value={feedbacks[chapter.id] || ''}
                                                onChange={(e) => setFeedbacks(prev => ({ ...prev, [chapter.id]: e.target.value }))}
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                className="btn-secondary"
                                                onClick={() => handleRegenerateChapterScaffold(chapter.id)}
                                                disabled={isRefreshing}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                                Rigenera
                                            </button>
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={handleConfirm}
                    className="btn-primary"
                    disabled={saving || chapters.length === 0}
                    style={{ padding: '0.8rem 2rem' }}
                >
                    {saving ? <Loader2 className="animate-spin" /> : <><CheckCircle size={18} /> Vai alla Produzione Testi</>}
                </button>
            </div>
        </div >
    );
};

export default ScaffoldRevisionPage;
