import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { supabase, callBookAgent, logDebug } from '../../lib/api';

interface Chapter {
    id: string;
    title: string;
    summary: string;
    paragraphs?: Array<{ title: string; description: string }>;
}


const BlueprintPage: React.FC = () => {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [saving, setSaving] = useState(false);
    const [chapterFeedbacks, setChapterFeedbacks] = useState<Record<string, string>>({});
    const [modifiedChapters, setModifiedChapters] = useState<Set<string>>(new Set());
    const [refreshing, setRefreshing] = useState<string | null>(null);

    useEffect(() => {
        const loadChapters = async () => {
            const saved = localStorage.getItem('project_chapters');
            if (saved) {
                try {
                    setChapters(JSON.parse(saved));
                    return;
                } catch (e) {
                    console.error("Failed to parse chapters", e);
                }
            }

            // Fallback: fetch from DB if bookId exists
            const bookId = localStorage.getItem('active_book_id');
            if (bookId) {
                const { data } = await supabase
                    .from('chapters')
                    .select('id, title, summary, structure')
                    .eq('book_id', bookId)
                    .order('chapter_number', { ascending: true });

                if (data && data.length > 0) {
                    const formatted = data.map(d => ({
                        id: d.id,
                        title: d.title,
                        summary: d.summary,
                        paragraphs: d.structure as Array<{ title: string; description: string }> || []
                    }));
                    setChapters(formatted);
                    localStorage.setItem('project_chapters', JSON.stringify(formatted));
                }
            }
        };

        loadChapters();
    }, []);

    const handleConfirm = async () => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId || chapters.length === 0) return;

        setSaving(true);
        const startTime = performance.now();
        await logDebug('frontend', 'blueprint_confirm_start', { chapters_count: chapters.length }, bookId);

        try {
            const dbChapters = chapters.map((c, index) => ({
                book_id: bookId,
                chapter_number: index + 1,
                title: c.title,
                summary: c.summary,
                structure: c.paragraphs, // Save paragraphs to DB
                status: 'PENDING'
            }));

            const { error } = await supabase
                .from('chapters')
                .insert(dbChapters);

            if (error) throw error;

            await supabase
                .from('books')
                .update({ status: 'PRODUCTION' })
                .eq('id', bookId);

            await logDebug('frontend', 'blueprint_confirm_success', {
                duration_ms: Math.round(performance.now() - startTime)
            }, bookId);

            navigate('/create/production');

        } catch (err: unknown) {
            const error = err as Error;
            console.error("Error saving blueprint:", error);
            await logDebug('frontend', 'blueprint_confirm_error', {
                error: error.message,
                duration_ms: Math.round(performance.now() - startTime)
            }, bookId);
            alert("Errore salvataggio struttura.");
        } finally {
            setSaving(false);
        }
    };

    const handleChapterModification = async (chapterId: string, index: number) => {
        const feedback = chapterFeedbacks[chapterId];
        if (!feedback) return;

        const bookId = localStorage.getItem('active_book_id');
        setRefreshing(chapterId);

        await logDebug('frontend', 'chapter_modification_start', {
            chapterIndex: index,
            chapterId: chapterId,
            feedback_length: feedback.length
        }, bookId);

        const startTime = performance.now();

        try {
            const data = await callBookAgent('OUTLINE', {
                feedback,
                targetChapterIndex: index, // Indicating which chapter to change if the agent supports it
                currentChapters: chapters.map(c => ({ title: c.title, summary: c.summary, paragraphs: c.paragraphs }))
            }, bookId);
            const resData = data.data || data;

            if (resData.bookId) {
                localStorage.setItem('active_book_id', resData.bookId);
            }

            if (resData.chapters) {
                setChapters(prev => {
                    const next = [...prev];
                    const aiChapter = resData.chapters[index];

                    if (aiChapter && next[index]) {
                        // Granular update: only change the targeted chapter
                        next[index] = {
                            ...next[index],
                            title: aiChapter.title,
                            summary: aiChapter.summary || aiChapter.scene_description,
                            paragraphs: aiChapter.paragraphs // Update paragraphs from AI
                        };
                    } else {
                        // Fallback: Use the new list but preserve IDs where possible
                        const fallback = resData.chapters.map((c: { title: string; summary?: string; scene_description?: string; paragraphs?: Array<{ title: string; description: string }> }, i: number) => ({
                            id: prev[i]?.id || `chap-${i}-${Date.now()}`,
                            title: c.title,
                            summary: c.summary || c.scene_description || '',
                            paragraphs: c.paragraphs || []
                        }));
                        localStorage.setItem('project_chapters', JSON.stringify(fallback));
                        return fallback;
                    }

                    localStorage.setItem('project_chapters', JSON.stringify(next));
                    return next;
                });

                // Track that this chapter was modified
                setModifiedChapters(prev => new Set(prev).add(chapterId));

                // Clear feedback for this chapter
                setChapterFeedbacks(prev => {
                    const next = { ...prev };
                    delete next[chapterId];
                    return next;
                });

                await logDebug('frontend', 'chapter_modification_success', {
                    chapterId,
                    duration_ms: Math.round(performance.now() - startTime)
                }, bookId);
            }
        } catch (err: unknown) {
            const error = err as Error;
            console.error(error);
            await logDebug('frontend', 'chapter_modification_error', {
                chapterId,
                error: error.message,
                duration_ms: Math.round(performance.now() - startTime)
            }, bookId);
            alert("Errore durante l'aggiornamento. Riprova.");
        } finally {
            setRefreshing(null);
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem', justifyContent: 'center' }}>
                <div style={{ height: '4px', width: '40px', background: 'var(--success)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--success)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--primary)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
            </div>

            <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>L'Architetto ha disegnato questo.</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                    Questa è l'ossatura del tuo libro. La struttura è fissa per garantire la coerenza del volume scelto.
                </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {chapters.map((chapter, index) => {
                    const isModified = modifiedChapters.has(chapter.id);
                    const isRefreshing = refreshing === chapter.id;

                    return (
                        <div key={chapter.id} className="glass-panel" style={{
                            padding: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem',
                            background: 'rgba(30, 41, 59, 0.4)',
                            border: isModified ? '1px solid var(--success)' : '1px solid var(--glass-border)',
                            opacity: isModified ? 0.8 : 1,
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <input
                                        className="invisible-input"
                                        value={chapter.title}
                                        readOnly
                                        style={{
                                            fontWeight: 700,
                                            fontSize: '1.1rem',
                                            marginBottom: '0.2rem',
                                            width: '100%',
                                            background: 'transparent',
                                            border: 'none',
                                            padding: 0,
                                            color: 'var(--text-main)',
                                            cursor: 'default'
                                        }}
                                    />
                                    <input
                                        className="invisible-input"
                                        value={chapter.summary}
                                        readOnly
                                        style={{
                                            fontSize: '0.9rem',
                                            color: 'var(--text-muted)',
                                            width: '100%',
                                            background: 'transparent',
                                            border: 'none',
                                            padding: 0,
                                            cursor: 'default'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    {isModified && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>
                                            <CheckCircle size={16} /> Modificato
                                        </div>
                                    )}
                                    {chapter.paragraphs && chapter.paragraphs.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                                            {chapter.paragraphs.length} Paragrafi definiti
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Paragraphs List */}
                            {chapter.paragraphs && chapter.paragraphs.length > 0 && (
                                <div style={{
                                    paddingLeft: '1.5rem',
                                    borderLeft: '2px solid rgba(255,255,255,0.1)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    marginTop: '0.5rem'
                                }}>
                                    {chapter.paragraphs.map((p, pi) => (
                                        <div key={pi} style={{ fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{pi + 1}. {p.title}</span>
                                            <p style={{ margin: '0.1rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{p.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!isModified && (
                                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <div style={{ position: 'relative' }}>
                                        <textarea
                                            placeholder="Cosa vorresti cambiare in questo capitolo? (max 200 caratteri)"
                                            value={chapterFeedbacks[chapter.id] || ''}
                                            onChange={(e) => setChapterFeedbacks(prev => ({ ...prev, [chapter.id]: e.target.value.slice(0, 200) }))}
                                            maxLength={200}
                                            style={{
                                                width: '100%',
                                                padding: '0.8rem',
                                                paddingBottom: '1.5rem',
                                                borderRadius: '8px',
                                                background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid var(--glass-border)',
                                                color: 'white',
                                                minHeight: '80px',
                                                fontSize: '0.85rem',
                                                resize: 'none'
                                            }}
                                            disabled={refreshing !== null}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '5px',
                                            right: '10px',
                                            fontSize: '0.7rem',
                                            color: (chapterFeedbacks[chapter.id] || '').length >= 180 ? 'var(--error)' : 'var(--text-muted)',
                                            fontWeight: 600
                                        }}>
                                            {(chapterFeedbacks[chapter.id] || '').length} / 200
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleChapterModification(chapter.id, index)}
                                        disabled={refreshing !== null || !chapterFeedbacks[chapter.id]}
                                        className="btn-secondary"
                                        style={{ padding: '0.5rem 1rem', alignSelf: 'flex-end', fontSize: '0.8rem' }}
                                    >
                                        {isRefreshing ? <><Loader2 size={14} className="animate-spin" /> ...</> : 'Applica Modifica'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>


            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleConfirm} className="btn-primary" disabled={saving} style={{ padding: '0.8rem 2rem' }}>
                    {saving ? <Loader2 className="animate-spin" /> : <><CheckCircle size={18} /> Conferma Struttura Finale</>}
                </button>
            </div>
        </div >
    );
};

export default BlueprintPage;
