import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, Loader2, FileText, ChevronRight, Edit2, RefreshCw, Save, X } from 'lucide-react';
import { marked } from 'marked';
import type { BookGenerationRunStatus } from '../../lib/api';
import { callBookAgent, getBookGenerationStatus, startBookGeneration, supabase } from '../../lib/api';

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

type RunPhase = BookGenerationRunStatus['phase'];
type RunStatus = BookGenerationRunStatus['status'];

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
    const [runId, setRunId] = useState<string | null>(null);
    const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
    const [runPhase, setRunPhase] = useState<RunPhase | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [currentRunChapterId, setCurrentRunChapterId] = useState<string | null>(null);
    const [currentRunChapterNumber, setCurrentRunChapterNumber] = useState<number | null>(null);
    const [startingRun, setStartingRun] = useState(false);
    const [_runPollErrors, setRunPollErrors] = useState(0);

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
    const isRunActive = runStatus === 'pending' || runStatus === 'planning' || runStatus === 'writing' || runStatus === 'review';

    const persistRunId = useCallback((nextRunId: string | null) => {
        if (!bookId) return;
        const storageKey = `book_generation_run_${bookId}`;
        if (nextRunId) {
            localStorage.setItem(storageKey, nextRunId);
        } else {
            localStorage.removeItem(storageKey);
        }
    }, [bookId]);

    const syncRunState = useCallback((run: BookGenerationRunStatus | null) => {
        if (!run) {
            setRunId(null);
            setRunStatus(null);
            setRunPhase(null);
            setRunError(null);
            setCurrentRunChapterId(null);
            setCurrentRunChapterNumber(null);
            setRunPollErrors(0);
            persistRunId(null);
            return;
        }

        setRunId(run.id);
        setRunStatus(run.status);
        setRunPhase(run.phase);
        setRunError(run.last_error || null);
        setCurrentRunChapterId(run.current_chapter_id || null);
        setCurrentRunChapterNumber(run.current_chapter_number || null);
        setRunPollErrors(0);
        persistRunId(run.id);
    }, [persistRunId]);

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

    const fetchActiveRun = useCallback(async () => {
        if (!bookId) return;

        const storedRunId = localStorage.getItem(`book_generation_run_${bookId}`);

        if (storedRunId) {
            try {
                const run = await getBookGenerationStatus(storedRunId);
                syncRunState(run);
                return;
            } catch (error) {
                console.warn('Stored generation run is no longer available:', error);
                persistRunId(null);
            }
        }

        const activeStatuses: RunStatus[] = ['pending', 'planning', 'writing', 'review'];
        const { data: run, error } = await supabase
            .from('book_generation_runs')
            .select('*')
            .eq('book_id', bookId)
            .in('status', activeStatuses)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(error);
            return;
        }

        syncRunState((run as BookGenerationRunStatus | null) || null);
    }, [bookId, persistRunId, syncRunState]);

    useEffect(() => {
        fetchChapters();
        fetchActiveRun();

        // Polling if Realtime falls back. Keeping it simple via polling every 8s is safer for mass updates.
        const interval = setInterval(fetchChapters, 8000);
        return () => clearInterval(interval);
    }, [fetchActiveRun, fetchChapters]);

    useEffect(() => {
        if (!isRunActive) return;
        let phaseIndex = 0;
        const interval = setInterval(() => {
            setLoadingMessage(loadingPhases[phaseIndex]);
            phaseIndex = (phaseIndex + 1) % loadingPhases.length;
        }, 3000);
        return () => clearInterval(interval);
    }, [isRunActive, loadingPhases]);

    useEffect(() => {
        if (!runId || !isRunActive) return;

        let cancelled = false;
        const poll = async () => {
            try {
                const run = await getBookGenerationStatus(runId);
                if (cancelled) return;
                syncRunState(run);
                await fetchChapters();
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to poll book generation run:', error);
                    setRunPollErrors(prev => {
                        const next = prev + 1;
                        if (next >= 3) {
                            setRunError('Stato generazione non raggiungibile. Se il job è bloccato, riprova o rigenera.');
                            syncRunState(null);
                        }
                        return next;
                    });
                }
            }
        };

        poll();
        const interval = setInterval(poll, 5000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [fetchChapters, isRunActive, runId, syncRunState]);

    useEffect(() => {
        if (!runPhase) {
            setLoadingSubMessage('');
            return;
        }

        const chapterLabel = currentRunChapterNumber ? `Capitolo ${currentRunChapterNumber}` : 'capitolo corrente';

        if (runPhase === 'outline') {
            setLoadingSubMessage("Verifica struttura capitoli e blueprint...");
            return;
        }

        if (runPhase === 'scaffold') {
            setLoadingSubMessage("Controllo e completamento delle tracce dei sottocapitoli...");
            return;
        }

        if (runPhase === 'write_chapter') {
            setLoadingSubMessage(`L'orchestratore sta scrivendo ${chapterLabel} in modo sequenziale...`);
            return;
        }

        if (runPhase === 'final_review') {
            setLoadingSubMessage("Controllo finale di completezza e target pagine...");
            return;
        }

        setLoadingSubMessage('');
    }, [currentRunChapterNumber, runPhase]);

    const checkChapterCompletion = (c: DBChapter) => {
        return c.status === 'COMPLETED';
    };

    const generateAll = async () => {
        if (!bookId) return;

        setStartingRun(true);
        setRunError(null);
        setLoadingMessage(loadingPhases[0]);

        try {
            const result = await startBookGeneration(bookId);
            setRunId(result.runId);
            setRunStatus('pending');
            setRunPhase('outline');
            persistRunId(result.runId);
            await fetchChapters();
        } catch (error) {
            const err = error as Error & { runId?: string; status?: RunStatus; phase?: RunPhase };
            if (err.runId) {
                setRunId(err.runId);
                setRunStatus(err.status || 'pending');
                setRunPhase(err.phase || 'outline');
                persistRunId(err.runId);
            } else {
                setRunError(err.message || 'Avvio della generazione fallito');
            }
        } finally {
            setStartingRun(false);
        }
    };

    const currentChapter = chapters.find(c => c.id === selectedChapterId);
    const activeRunChapter = currentRunChapterId
        ? chapters.find(c => c.id === currentRunChapterId) || null
        : (currentRunChapterNumber
            ? chapters.find((_, index) => index + 1 === currentRunChapterNumber) || null
            : null);
    const completedCount = chapters.filter(c => checkChapterCompletion(c)).length;
    const progress = (completedCount / Math.max(chapters.length, 1)) * 100;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', gap: '1rem', overflow: 'hidden' }}>

            {isRunActive && (
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
                        {activeRunChapter && (
                            <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
                                In lavorazione: {activeRunChapter.title}
                            </p>
                        )}
                    </div>

                    {/* Bottone di emergenza per sbloccare la UI in caso di stallo */}
                    <div style={{
                        position: 'fixed',
                        bottom: '2rem',
                        left: '2rem',
                        zIndex: 1001
                    }}>
                        <button
                            onClick={() => {
                                if (confirm("Vuoi davvero chiudere l'overlay? Se la generazione è ancora in corso sul server, continuerà in background.")) {
                                    syncRunState(null);
                                }
                            }}
                            className="btn-secondary"
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '12px',
                                color: 'rgba(255, 255, 255, 0.4)',
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                            }}
                        >
                            <X size={14} /> Forza Chiusura Overlay (Se bloccato)
                        </button>
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
                    {runError && (
                        <div style={{
                            marginTop: '0.9rem',
                            padding: '0.75rem 0.9rem',
                            borderRadius: '12px',
                            background: 'rgba(255, 99, 132, 0.08)',
                            border: '1px solid rgba(255, 99, 132, 0.25)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                        }}>
                            {runError}
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{completedCount} / {chapters.length} capitoli completati</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={generateAll} disabled={startingRun || isRunActive || completedCount === chapters.length} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                {startingRun ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Elabora Tutto
                            </button>
                        </div>
                    </div>
                    {runId && (
                        <div style={{ marginTop: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Run: {runPhase || 'n/d'} · Stato: {runStatus || 'n/d'}
                        </div>
                    )}
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
