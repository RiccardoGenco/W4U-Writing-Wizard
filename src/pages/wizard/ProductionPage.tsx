import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, CheckCircle2, Loader2, FileText, ChevronRight, ChevronDown, Save, Edit3 } from 'lucide-react';
import { marked } from 'marked';
import { callBookAgent, supabase } from '../../lib/api';
import { getBookTypeForGenre, getPromptsForGenre, GENRE_DEFINITIONS } from '../../data/genres';
import { getToneDescription, injectVariables } from '../../utils/prompt-engine';

interface DBChapter {
    id: string; // UUID from DB
    title: string;
    summary: string;
    content: string | null;
    status: string;
    structure: Array<{ title: string; description: string }> | null;
    chapter_number: number;
}

const ProductionPage: React.FC = () => {

    const [chapters, setChapters] = useState<DBChapter[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

    // Editor State
    const [isEditing, setIsEditing] = useState(false);
    const [editorContent, setEditorContent] = useState("");
    const [saving, setSaving] = useState(false);

    const [globalGenerating, setGlobalGenerating] = useState(false);

    // Stati per l'overlay di caricamento
    const [loadingMessage, setLoadingMessage] = useState("Analisi del blueprint narrativo...");
    const [loadingSubMessage, setLoadingSubMessage] = useState("");

    const loadingPhases = useRef([
        "Analisi del blueprint narrativo...",
        "Sviluppo personaggi...",
        "Costruzione ambientazione...",
        "Scrittura dialoghi...",
        "Controllo coerenza...",
        "Revisione grammaticale...",
        "Finalizzazione capitoli..."
    ]);

    const bookId = localStorage.getItem('active_book_id');

    const fetchChapters = useCallback(async () => {
        if (!bookId) return;
        const { data, error } = await supabase
            .from('chapters')
            .select('*')
            .eq('book_id', bookId)
            .order('chapter_number', { ascending: true });

        if (error) console.error(error);
        if (data) {
            setChapters(data);
            if (data.length > 0 && !selectedChapterId) {
                setSelectedChapterId(data[0].id);
                setExpandedChapters(new Set([data[0].id]));
            }
        }
    }, [bookId, selectedChapterId]);

    useEffect(() => {
        if (!bookId) return;
        fetchChapters();

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
                (payload: unknown) => {
                    const p = payload as { eventType: string; new: DBChapter };
                    if (p.eventType === 'UPDATE') {
                        const updated = p.new;
                        setChapters(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));

                        // If we are viewing this chapter and it's not being edited, update content
                        if (updated.id === selectedChapterId && !isEditing) {
                            setEditorContent(updated.content || "");
                        }
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    const interval = setInterval(fetchChapters, 10000);
                    return () => clearInterval(interval);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        }
    }, [bookId, fetchChapters, isEditing, selectedChapterId]);

    // Quando cambia il capitolo selezionato, aggiorna l'editor
    useEffect(() => {
        const current = chapters.find(c => c.id === selectedChapterId);
        if (current) {
            setEditorContent(current.content || "");
            setIsEditing(false); // Reset editing mode on change? Or keep visual mode?
        }
    }, [selectedChapterId, chapters]);

    // Loading effect logic
    useEffect(() => {
        if (!globalGenerating) return;
        let phaseIndex = 0;
        setLoadingMessage(loadingPhases.current[0]);
        setLoadingSubMessage(`Preparazione generazione ${chapters.length} capitoli...`);
        const interval = setInterval(() => {
            phaseIndex = (phaseIndex + 1) % loadingPhases.current.length;
            setLoadingMessage(loadingPhases.current[phaseIndex]);
            const completed = chapters.filter(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50)).length;
            setLoadingSubMessage(`Progresso: ${completed}/${chapters.length} capitoli completati`);
        }, 2500);
        return () => clearInterval(interval);
    }, [globalGenerating, chapters]);

    const toggleChapter = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedChapters(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const saveContent = async () => {
        if (!selectedChapterId) return;
        setSaving(true);
        try {
            await supabase
                .from('chapters')
                .update({ content: editorContent, status: 'COMPLETED' })
                .eq('id', selectedChapterId);
        } catch (e) {
            console.error(e);
            alert("Errore salvataggio");
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    };

    const generateChapter = async (id: string) => {
        setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'GENERATING' } : c));
        try {
            const { data: bookData } = await supabase.from('books').select('genre, context_data, title').eq('id', bookId).single();
            const genre = bookData?.genre || '';
            const config = bookData?.context_data?.configuration;

            const rawPrompts = getPromptsForGenre(genre);
            const baseTemplate = rawPrompts?.WRITER || '';
            const bookType = getBookTypeForGenre(genre);

            // Derive style factors to map the stored configuration correctly
            const genreDef = GENRE_DEFINITIONS[genre];
            const currentStyleFactors = genreDef?.styleFactors || [
                { id: 'serious', labelLow: 'Giocoso/Ironico', labelHigh: 'Serio/Accademico', defaultValue: 0.5 },
                { id: 'concise', labelLow: bookType === 'FICTION' ? 'Descrittivo' : 'Approfondito', labelHigh: bookType === 'FICTION' ? 'Conciso' : 'Sintetico', defaultValue: 0.5 },
                { id: 'simple', labelLow: bookType === 'FICTION' ? 'Complesso/Letterario' : 'Tecnico/Specialistico', labelHigh: 'Semplice/Divulgativo', defaultValue: 0.5 }
            ];

            const toneDesc = getToneDescription(bookType, config || {}, currentStyleFactors);

            const currentChapter = chapters.find(c => c.id === id);
            const writerPrompt = injectVariables(baseTemplate, {
                bookTitle: bookData?.title || "Senza Titolo",
                genre: genre,
                tone: toneDesc,
                target: config?.targets?.join(", ") || "Pubblico generale",
                chapterTitle: currentChapter?.title || "Senza Titolo",
                chapterSummary: currentChapter?.summary || "Nessun sommario disponibile",
                paragraphs: JSON.stringify(currentChapter?.structure || [])
            });

            await callBookAgent('WRITE', { chapterId: id, systemPrompt: writerPrompt }, bookId);
            setTimeout(() => { fetchChapters(); }, 5000);
        } catch (e) {
            console.error(e);
            alert("Errore avvio generazione.");
            setChapters(prev => prev.map(c => c.id === id ? { ...c, status: 'PENDING' } : c));
        }
    };

    const generateAll = async () => {
        setGlobalGenerating(true);
        const toGenerate = chapters.filter(c => !c.content || c.status === 'PENDING' || c.status === 'ERROR');
        for (const chap of toGenerate) {
            await generateChapter(chap.id);
            await new Promise(r => setTimeout(r, 2000)); // Stagger slightly
        }
        setGlobalGenerating(false);
    };

    const currentChapter = chapters.find(c => c.id === selectedChapterId);
    const completedCount = chapters.filter(c => c.status === 'COMPLETED' || (c.content && c.content.length > 50)).length;
    const progress = (completedCount / Math.max(chapters.length, 1)) * 100;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', gap: '1rem', overflow: 'hidden' }}>

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

            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '90vh' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Indice</h2>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{completedCount}/{chapters.length}</span>
                    </div>
                    <div className="progress-container"><div className="progress-bar" style={{ width: `${progress}%` }}></div></div>

                    <button onClick={fetchChapters} className="btn-secondary" style={{ width: '100%', marginTop: '1rem', fontSize: '0.8rem', padding: '0.3rem' }}>
                        Aggiorna Lista
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                    {chapters.map(chapter => (
                        <div key={chapter.id} style={{ marginBottom: '0.5rem' }}>
                            <div
                                onClick={() => { setSelectedChapterId(chapter.id); if (!expandedChapters.has(chapter.id)) toggleChapter({ stopPropagation: () => { } } as unknown as React.MouseEvent, chapter.id); }}
                                style={{
                                    padding: '0.8rem',
                                    borderRadius: '8px',
                                    background: selectedChapterId === chapter.id ? 'rgba(79, 70, 229, 0.15)' : 'transparent',
                                    border: selectedChapterId === chapter.id ? '1px solid var(--primary)' : '1px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                    <div onClick={(e: React.MouseEvent) => toggleChapter(e, chapter.id)} style={{ padding: '2px', cursor: 'pointer' }}>
                                        {expandedChapters.has(chapter.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {chapter.chapter_number}. {chapter.title}
                                    </span>
                                </div>
                                {chapter.status === 'GENERATING' && <Loader2 size={14} className="animate-spin" color="var(--accent)" />}
                                {chapter.status === 'COMPLETED' && <CheckCircle2 size={14} color="var(--success)" />}
                            </div>

                            {expandedChapters.has(chapter.id) && chapter.structure && (
                                <div style={{ paddingLeft: '2rem', marginTop: '0.2rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {chapter.structure.map((para, idx) => (
                                        <div key={idx}
                                            style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--text-muted)',
                                                padding: '4px 8px',
                                                borderLeft: '1px solid var(--glass-border)',
                                                cursor: 'pointer'
                                            }}
                                            className="hover:text-white transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedChapterId(chapter.id);
                                            }}
                                        >
                                            {para.title || `Paragrafo ${idx + 1}`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                    <button onClick={generateAll} disabled={globalGenerating} className="btn-primary" style={{ width: '100%', fontSize: '0.9rem' }}>
                        <Play size={14} /> {globalGenerating ? 'Generazione...' : 'Genera Tutto'}
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} color="var(--accent)" />
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{currentChapter?.title || "Seleziona un capitolo"}</h2>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isEditing ? (
                            <button onClick={() => setIsEditing(true)} className="btn-secondary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                                <Edit3 size={14} /> Modifica
                            </button>
                        ) : (
                            <button onClick={saveContent} disabled={saving} className="btn-success" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', background: 'var(--success)', border: 'none' }}>
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} /> Salva</>}
                            </button>
                        )}
                        <button onClick={() => currentChapter && generateChapter(currentChapter.id)} disabled={currentChapter?.status === 'GENERATING'} className="btn-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                            <Play size={14} /> Rigenera
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(15, 23, 42, 0.5)', position: 'relative' }}>
                    {currentChapter ? (
                        currentChapter.status === 'GENERATING' && !currentChapter.content ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                <Loader2 size={40} className="animate-spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                <p>L'IA sta scrivendo questo capitolo...</p>
                            </div>
                        ) : (
                            isEditing ? (
                                <textarea
                                    value={editorContent}
                                    onChange={(e) => setEditorContent(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: 'transparent',
                                        color: '#e2e8f0',
                                        border: 'none',
                                        outline: 'none',
                                        padding: '2rem',
                                        fontSize: '1.1rem',
                                        lineHeight: '1.8',
                                        fontFamily: 'Merriweather, serif',
                                        resize: 'none'
                                    }}
                                    placeholder="Scrivi qui il contenuto del capitolo..."
                                />
                            ) : (
                                <div
                                    className="markdown-content"
                                    style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'Merriweather, serif' }}
                                    dangerouslySetInnerHTML={{ __html: marked.parse(editorContent || currentChapter.content || "_Nessun contenuto_") as string }}
                                />
                            )
                        )
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                            <p>Seleziona un capitolo dall'indice per iniziare.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductionPage;