import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, Loader2, FileText, ChevronRight, Edit2, RefreshCw, Save, X } from 'lucide-react';
import { marked } from 'marked';
import { callBookAgent, supabase } from '../../lib/api';

// Types
interface DBParagraph {
    id: string;
    chapter_id: string;
    paragraph_number: number;
    title: string;
    description: string;
    content: string | null;
    status: string;
    actual_word_count?: number | null;
    target_word_count?: number | null;
}

interface DBChapter {
    id: string;
    title: string;
    summary: string;
    content: string | null;
    status: string;
    paragraphs: DBParagraph[];
}

interface ScaffoldChapterResponse {
    paragraphs?: Array<{ title?: string; description?: string }>;
    data?: {
        paragraphs?: Array<{ title?: string; description?: string }>;
    };
}

const parsePositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
    }
    return null;
};

// -------------------------------------------------------------
// Component: ParagraphEditor
// -------------------------------------------------------------
const ParagraphEditor = ({ paragraph, bookId, chapterId, onUpdate }: { paragraph: DBParagraph, bookId: string, chapterId: string, onUpdate: () => void }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(paragraph.content || '');
    const [regenerating, setRegenerating] = useState(false);
    const [saving, setSaving] = useState(false);

    // Sync state when paragraph changes externally
    useEffect(() => {
        setEditContent(paragraph.content || '');
    }, [paragraph.content]);

    const handleSave = async () => {
        setSaving(true);
        // Update paragraph content and status
        await supabase.from('paragraphs').update({ content: editContent, status: 'COMPLETED' }).eq('id', paragraph.id);

        setIsEditing(false);
        setSaving(false);
        onUpdate();
    };

    const handleRegenerate = async () => {
        setRegenerating(true);
        try {
            await supabase.from('paragraphs').update({ status: 'GENERATING' }).eq('id', paragraph.id);
            onUpdate();

            await callBookAgent('WRITE_PARAGRAPH', {
                paragraphId: paragraph.id,
                chapterId: chapterId
            }, bookId);

            // Poll for individual regeneration
            let isDone = false;
            let attempts = 0;
            while (!isDone && attempts < 40) {
                await new Promise(r => setTimeout(r, 5000));
                const { data: check } = await supabase.from('paragraphs').select('status, content').eq('id', paragraph.id).single();
                if (check?.status === 'COMPLETED' || (check?.content && check.content.length > 50)) {
                    isDone = true;
                }
                attempts++;
            }
        } catch (e) {
            console.error(e);
            alert("Errore durante la rigenerazione.");
            await supabase.from('paragraphs').update({ status: 'PENDING' }).eq('id', paragraph.id);
        } finally {
            setRegenerating(false);
            onUpdate();
        }
    };

    return (
        <div style={{ 
            marginBottom: '2.5rem', 
            background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.12), rgba(var(--primary-rgb), 0.15))', 
            borderRadius: '24px', 
            border: '1px solid rgba(var(--primary-rgb), 0.2)', 
            overflow: 'hidden',
            boxShadow: '0 40px 100px -20px rgba(0, 0, 0, 0.25)',
            transition: 'all 0.3s ease'
        }}>
            <div style={{ 
                padding: '1.2rem 1.5rem', 
                borderBottom: '1px solid rgba(var(--primary-rgb), 0.1)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(var(--primary-rgb), 0.05)' 
            }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {paragraph.paragraph_number}. {paragraph.title}
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    {paragraph.status === 'GENERATING' || regenerating ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontSize: '0.85rem' }}>
                            <Loader2 size={14} className="animate-spin" /> Scrittura in corso...
                        </span>
                    ) : paragraph.status === 'COMPLETED' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--success)', fontSize: '0.85rem' }}>
                            <CheckCircle2 size={14} /> Completato
                        </span>
                    ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>In attesa</span>
                    )}

                    {!isEditing && (paragraph.status === 'COMPLETED' || (paragraph.content && paragraph.content.length > 10)) && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => setIsEditing(true)} className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Modifica testo">
                                <Edit2 size={12} /> Modifica
                            </button>
                            <button onClick={handleRegenerate} disabled={regenerating} className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Rigenera con IA">
                                {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Rigenera
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ padding: '1.5rem' }}>
                {isEditing ? (
                    <div className="animate-fade-in">
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{
                                width: '100%', minHeight: '300px', background: '#ffffff',
                                color: '#000000', border: '1px solid rgba(0, 0, 0, 0.15)',
                                borderRadius: '16px', padding: '1.5rem', resize: 'vertical',
                                fontSize: '1.05rem', lineHeight: '1.7',
                                boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.08)'
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1rem' }}>
                            <button onClick={() => { setIsEditing(false); setEditContent(paragraph.content || ''); }} className="btn-secondary" disabled={saving}>
                                <X size={16} /> Annulla
                            </button>
                            <button onClick={handleSave} className="btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva Modifiche
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        {paragraph.content ? (
                            <div className="markdown-content" style={{ fontSize: '1.05rem', lineHeight: '1.7' }} dangerouslySetInnerHTML={{ __html: marked.parse(paragraph.content) as string }} />
                        ) : (
                            <div style={{ 
                                color: 'var(--text-muted)', 
                                fontSize: '0.95rem', 
                                background: 'rgba(0, 242, 255, 0.02)', 
                                padding: '1.5rem', 
                                borderRadius: '16px',
                                border: '1px dashed rgba(0, 242, 255, 0.1)'
                            }}>
                                <p style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={16} /> Obiettivo della scena:
                                </p>
                                <p style={{ fontStyle: 'italic', color: 'var(--text-main)', opacity: 0.8 }}>{paragraph.description}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};


// -------------------------------------------------------------
// Component: ProductionPage
// -------------------------------------------------------------
const ProductionPage: React.FC = () => {
    const navigate = useNavigate();

    const [chapters, setChapters] = useState<DBChapter[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [globalGenerating, setGlobalGenerating] = useState(false);

    // Overlay feedback
    const [loadingMessage, setLoadingMessage] = useState("Scrittura del libro...");
    const [loadingSubMessage, setLoadingSubMessage] = useState("");

    const loadingPhases = useMemo(() => [
        "Sviluppo personaggi ed eventi...",
        "Costruzione scene d'azione...",
        "Scrittura dialoghi profondi...",
        "Arricchimento sensoriale...",
        "Verifica continuità narrativa..."
    ], []);

    const bookId = localStorage.getItem('active_book_id');

    const getExpectedParagraphsPerChapter = useCallback(async (): Promise<number> => {
        if (!bookId) return 5;

        const { data: book } = await supabase
            .from('books')
            .select('target_pages, target_chapters, context_data')
            .eq('id', bookId)
            .single();

        const targetPages = parsePositiveInt(book?.target_pages) ?? parsePositiveInt(book?.context_data?.target_pages);
        const targetChapters = parsePositiveInt(book?.target_chapters);

        if (!targetPages || !targetChapters) {
            return 5;
        }

        return Math.max(1, Math.round(targetPages / targetChapters));
    }, [bookId]);

    const ensureChapterPlanCompleteness = useCallback(async (chapter: DBChapter, chapterParagraphs: DBParagraph[]): Promise<DBParagraph[]> => {
        if (!bookId) return chapterParagraphs;

        const expectedCount = await getExpectedParagraphsPerChapter();
        if (chapterParagraphs.length >= expectedCount) {
            return chapterParagraphs;
        }

        const scaffoldData: ScaffoldChapterResponse = await callBookAgent('SCAFFOLD_CHAPTER', {
            chapter: {
                id: chapter.id,
                title: chapter.title,
                summary: chapter.summary || ''
            },
            targetParagraphCount: expectedCount
        }, bookId);

        const aiParagraphs = scaffoldData?.paragraphs || scaffoldData?.data?.paragraphs || [];
        if (!Array.isArray(aiParagraphs) || aiParagraphs.length === 0) {
            throw new Error('Scaffold chapter returned no paragraphs');
        }

        const existingByNumber = new Map<number, DBParagraph>();
        for (const p of chapterParagraphs) {
            existingByNumber.set(p.paragraph_number, p);
        }

        const inserts: Array<{ chapter_id: string; paragraph_number: number; title: string; description: string; status: string; target_word_count: number }> = [];
        for (let n = 1; n <= expectedCount; n++) {
            if (existingByNumber.has(n)) continue;
            const ai = aiParagraphs[n - 1] || {};
            inserts.push({
                chapter_id: chapter.id,
                paragraph_number: n,
                title: (ai.title && ai.title.trim()) ? ai.title.trim() : `Sottocapitolo ${n}`,
                description: ai.description || '',
                status: 'PENDING',
                target_word_count: 250
            });
        }

        if (inserts.length > 0) {
            const { error } = await supabase.from('paragraphs').insert(inserts);
            if (error) throw error;
        }

        const { data: refreshed, error: refreshedErr } = await supabase
            .from('paragraphs')
            .select('*')
            .eq('chapter_id', chapter.id)
            .order('paragraph_number', { ascending: true });
        if (refreshedErr) throw refreshedErr;

        return (refreshed || []) as DBParagraph[];
    }, [bookId, getExpectedParagraphsPerChapter]);

    const fetchChapters = useCallback(async () => {
        if (!bookId) return;

        const { data: chaptersData, error: cErr } = await supabase
            .from('chapters')
            .select('*')
            .eq('book_id', bookId)
            .order('chapter_number', { ascending: true });

        if (cErr) console.error(cErr);
        if (chaptersData) {
            const compiledChapters = await Promise.all(chaptersData.map(async (c) => {
                const { data: paragraphs } = await supabase
                    .from('paragraphs')
                    .select('*')
                    .eq('chapter_id', c.id)
                    .order('paragraph_number', { ascending: true });

                const pList = paragraphs || [];
                const allDone = pList.length > 0 && pList.every(p => p.status === 'COMPLETED' || (p.content && p.content.length > 50));
                const isGenerating = pList.some(p => p.status === 'GENERATING');

                const compiledContent = pList.filter(p => p.content).map(p => p.content).join('\\n\\n');

                return {
                    ...c,
                    paragraphs: pList as DBParagraph[],
                    content: compiledContent || c.content,
                    status: allDone ? 'COMPLETED' : (isGenerating ? 'GENERATING' : c.status)
                };
            }));

            setChapters(compiledChapters);
            if (compiledChapters.length > 0 && !selectedChapterId) {
                setSelectedChapterId(compiledChapters[0].id);
            }
        }
    }, [bookId, selectedChapterId]);

    useEffect(() => {
        fetchChapters();

        // Polling if Realtime falls back. Keeping it simple via polling every 8s is safer for mass updates.
        const interval = setInterval(fetchChapters, 8000);
        return () => clearInterval(interval);
    }, [fetchChapters]);

    useEffect(() => {
        if (!globalGenerating) return;
        let phaseIndex = 0;
        const interval = setInterval(() => {
            setLoadingMessage(loadingPhases[phaseIndex]);
            phaseIndex = (phaseIndex + 1) % loadingPhases.length;
        }, 3000);
        return () => clearInterval(interval);
    }, [globalGenerating, loadingPhases]);


    const generateChapter = async (id: string, chapterParagraphs: DBParagraph[]) => {
        const chapter = chapters.find(c => c.id === id);
        if (!chapter) return;

        // Optimistic update
        setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'GENERATING' } : c));

        try {
            const expectedParagraphs = await getExpectedParagraphsPerChapter();
            const targetChapterWords = expectedParagraphs * 250;
            const minChapterWords = Math.floor(targetChapterWords * 0.85);

            const effectiveParagraphs = await ensureChapterPlanCompleteness(chapter, chapterParagraphs);

            // Check if any paragraphs actually need generating
            const needsGeneration = effectiveParagraphs.some(p => p.status !== 'COMPLETED' && (!p.content || p.content.length < 50));
            
            if (needsGeneration) {
                // Mark all incomplete paragraphs as GENERATING
                const pendingIds = effectiveParagraphs.filter(p => p.status !== 'COMPLETED').map(p => p.id);
                if (pendingIds.length > 0) {
                    await supabase.from('paragraphs').update({ status: 'GENERATING' }).in('id', pendingIds);
                    fetchChapters();
                }

                // Call the agent once for the FULL CHAPTER
                await callBookAgent('WRITE_CHAPTER_FROM_PLAN', {
                    chapterId: id,
                    targetWordCount: targetChapterWords
                }, bookId);

                // Wait for ALL paragraphs to be completed
                let isDone = false;
                let attempts = 0;
                while (!isDone && attempts < 120) { // Can take up to 10 minutes for a huge chapter
                    await new Promise(r => setTimeout(r, 5000));
                    const { data: checks } = await supabase.from('paragraphs')
                        .select('status, content')
                        .eq('chapter_id', id);
                    
                    if (checks && checks.every(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50))) {
                        isDone = true;
                    }
                    attempts++;
                }

                // Compile chapter
                const { data: latestParagraphs } = await supabase.from('paragraphs').select('content').eq('chapter_id', id).order('paragraph_number', { ascending: true });
                if (latestParagraphs) {
                    const compiled = latestParagraphs.filter(p => p.content).map(p => p.content).join('\n\n');
                    await supabase.from('chapters').update({ content: compiled }).eq('id', id);
                }
            }

            const { data: finalParagraphs } = await supabase
                .from('paragraphs')
                .select('content, actual_word_count, target_word_count')
                .eq('chapter_id', id);

            const totalWords = (finalParagraphs || []).reduce((acc, p) => {
                if (Number.isFinite(p.actual_word_count) && (p.actual_word_count || 0) > 0) {
                    return acc + Number(p.actual_word_count);
                }
                const text = p.content || '';
                const wc = text.split(/\s+/).filter((w: string) => w.length > 0).length;
                return acc + wc;
            }, 0);

            if (totalWords < minChapterWords) {
                await supabase.from('chapters').update({ status: 'PENDING' }).eq('id', id);
                throw new Error(`Capitolo sotto target qualitativo: ${totalWords} parole, minimo richiesto ${minChapterWords}`);
            }

            // After all paragraphs are done and quality threshold is satisfied, mark chapter as COMPLETED
            await supabase.from('chapters').update({ status: 'COMPLETED' }).eq('id', id);

            fetchChapters();
        } catch (e) {
            console.error("Error generating chapter paragraphs:", e);
            setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'PENDING' } : c));
        }
    };

    const checkChapterCompletion = (c: DBChapter) => {
        return c.status === 'COMPLETED';
    };

    const generateAll = async () => {
        setGlobalGenerating(true);
        setLoadingMessage(loadingPhases[0]);

        const toGenerate = chapters.filter(c => !checkChapterCompletion(c));

        for (const chap of toGenerate) {
            setLoadingSubMessage(`L'IA sta scrivendo il Capitolo: ${chap.title}...`);
            await generateChapter(chap.id, chap.paragraphs);

            // Wait until it's really fully updated in state
            await fetchChapters();
        }

        setGlobalGenerating(false);
        fetchChapters();
    };

    const currentChapter = chapters.find(c => c.id === selectedChapterId);
    const completedCount = chapters.filter(c => checkChapterCompletion(c)).length;
    const progress = (completedCount / Math.max(chapters.length, 1)) * 100;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', gap: '1rem', overflow: 'hidden' }}>

            {globalGenerating && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.95)', backdropFilter: 'blur(20px)',
                    zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%',
                        border: '3px solid rgba(0, 242, 255, 0.1)', borderTop: '3px solid var(--primary)', borderRight: '3px solid var(--accent)',
                        animation: 'spin 1s linear infinite', boxShadow: '0 0 30px rgba(0, 242, 255, 0.3)'
                    }} />
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '0.5rem', textShadow: '0 0 20px rgba(0, 242, 255, 0.5)' }}>
                            {loadingMessage}
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 500 }}>{loadingSubMessage}</p>
                    </div>
                </div>
            )}

            {/* Left Panel: Chapter List */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '90vh' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Produzione Testi</h2>
                    <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{completedCount} / {chapters.length} capitoli completati</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={generateAll} disabled={globalGenerating || completedCount === chapters.length} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                <Play size={14} /> Elabora Tutto
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {chapters.map(chapter => {
                        const isCompleted = checkChapterCompletion(chapter);
                        const isGenerating = chapter.status === 'GENERATING';

                        return (
                            <div
                                key={chapter.id}
                                onClick={() => setSelectedChapterId(chapter.id)}
                                style={{
                                    padding: '1rem', marginBottom: '0.8rem', borderRadius: '12px',
                                    background: selectedChapterId === chapter.id ? 'rgba(79, 70, 229, 0.1)' : 'rgba(255,255,255,0.03)',
                                    border: selectedChapterId === chapter.id ? '1px solid var(--primary)' : '1px solid transparent',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{chapter.title}</span>
                                    {isCompleted && <CheckCircle2 size={16} color="var(--success)" />}
                                    {isGenerating && <Loader2 size={16} className="animate-spin" color="var(--accent)" />}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {chapter.paragraphs.length} sottocapitoli
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                    <button
                        onClick={async () => {
                            if (bookId) await supabase.from('books').update({ status: 'COVER' }).eq('id', bookId);
                            navigate('/create/cover');
                        }}
                        className="btn-primary" style={{ width: '100%' }}
                    >
                        Genera Copertina <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Right Panel: Preview & Editing (Paragraphs) */}
            <div className="glass-panel" style={{ height: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ 
                    padding: '1.5rem', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem',
                    background: 'rgba(0, 242, 255, 0.02)'
                }}>
                    <FileText size={20} color="var(--primary)" />
                    <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--primary)' }}>{currentChapter?.title}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>— Sottocapitoli</span>
                </div>

                <div style={{ padding: '2rem', flex: 1, overflowY: 'auto', background: 'rgba(15, 23, 42, 0.3)' }}>
                    {currentChapter?.paragraphs && currentChapter.paragraphs.length > 0 ? (
                        currentChapter.paragraphs.map(p => (
                            <ParagraphEditor
                                key={p.id}
                                paragraph={p}
                                bookId={bookId || ''}
                                chapterId={currentChapter.id}
                                onUpdate={fetchChapters}
                            />
                        ))
                    ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <p>Nessun sottocapitolo trovato per questo capitolo.</p>
                        </div>
                    )}
                </div>
            </div>

        </div >
    );
};

export default ProductionPage;
