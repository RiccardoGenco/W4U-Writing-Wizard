import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Check, X, ChevronRight, FileEdit, Loader2, Save } from 'lucide-react';
import { supabase, callBookAgent } from '../../lib/api';

interface Chapter {
    id: string;
    title: string;
    content: string | null;
    chapter_number: number;
}

const EditorPage: React.FC = () => {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [suggestion, setSuggestion] = useState<string | null>(null);

    // New states for editing and autosave
    const [localContent, setLocalContent] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    const bookId = localStorage.getItem('active_book_id');

    useEffect(() => {
        if (!bookId) {
            setLoading(false);
            return;
        }
        fetchChapters();
    }, [bookId]);

    // Update local content when selected chapter changes
    useEffect(() => {
        if (chapters[selectedChapterIdx]) {
            setLocalContent(chapters[selectedChapterIdx].content || '');
            setSaveStatus('idle');
        }
    }, [selectedChapterIdx, chapters]);

    // Autosave logic
    useEffect(() => {
        // Trigger save only if content differs from last known database state
        if (chapters[selectedChapterIdx] && localContent !== (chapters[selectedChapterIdx].content || '')) {
            const delayDebounceFn = setTimeout(() => {
                saveContent(localContent);
            }, 3000); // 3 seconds debounce for autosave
            return () => clearTimeout(delayDebounceFn);
        }
    }, [localContent]);

    const fetchChapters = async () => {
        try {
            const { data, error } = await supabase
                .from('chapters')
                .select('id, title, content, chapter_number')
                .eq('book_id', bookId)
                .order('chapter_number', { ascending: true });

            if (error) throw error;
            if (data) setChapters(data);
        } catch (err) {
            console.error("Error fetching chapters:", err);
        } finally {
            setLoading(false);
        }
    };

    const saveContent = async (content: string) => {
        const chapterId = chapters[selectedChapterIdx]?.id;
        if (!chapterId) return;

        setSaveStatus('saving');
        try {
            const { error } = await supabase
                .from('chapters')
                .update({ content })
                .eq('id', chapterId);

            if (error) throw error;

            // Update local state to prevent re-triggering effect
            setChapters(prev => prev.map((c, i) => i === selectedChapterIdx ? { ...c, content } : c));
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err) {
            console.error("Error saving chapter:", err);
            setSaveStatus('error');
        }
    };

    const optimize = async () => {
        if (!bookId) return;
        setOptimizing(true);
        try {
            const response = await callBookAgent('EDIT', { content: localContent }, bookId);
            if (response.aiResponse) {
                setSuggestion(response.aiResponse);
            }
        } catch (err) {
            console.error("Optimization failed:", err);
            alert("Errore durante l'analisi del testo.");
        } finally {
            setOptimizing(false);
        }
    };

    const applySuggestion = () => {
        if (!suggestion) return;
        setLocalContent(suggestion);
        setSuggestion(null);
        // Save immediately after applying suggestion
        saveContent(suggestion);
    };

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" />
            </div>
        );
    }

    if (chapters.length === 0) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <p>Nessun capitolo trovato per questo progetto.</p>
                <button className="btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/create/production')}>
                    Torna alla Produzione
                </button>
            </div>
        );
    }

    const currentChapter = chapters[selectedChapterIdx];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 300px', gap: '1rem', height: '100%' }}>
            {/* Left: Chapter Nav */}
            <div className="glass-panel" style={{ padding: '1rem', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>Capitoli</h3>
                    {saveStatus === 'saving' && <Loader2 size={14} className="animate-spin" color="var(--accent)" />}
                    {saveStatus === 'saved' && <Check size={14} color="var(--success)" />}
                    {saveStatus === 'error' && <X size={14} color="var(--error)" />}
                </div>
                {chapters.map((c, i) => (
                    <div
                        key={c.id}
                        onClick={() => setSelectedChapterIdx(i)}
                        style={{
                            padding: '0.8rem',
                            borderRadius: '8px',
                            background: selectedChapterIdx === i ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
                            border: selectedChapterIdx === i ? '1px solid var(--primary)' : '1px solid transparent',
                            cursor: 'pointer',
                            marginBottom: '0.5rem',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ color: selectedChapterIdx === i ? 'white' : 'var(--text-muted)' }}>{c.chapter_number}.</span> {c.title}
                    </div>
                ))}
            </div>

            {/* Center: Content (EDITABLE) */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>{currentChapter.title}</h2>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {saveStatus === 'saving' ? 'Salvataggio...' :
                                saveStatus === 'saved' ? '✨ Modifiche salvate' :
                                    saveStatus === 'error' ? '❌ Errore salvataggio' :
                                        'Modalità scrittura'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <button
                            onClick={() => saveContent(localContent)}
                            className="btn-secondary"
                            disabled={saveStatus === 'saving' || localContent === (currentChapter.content || '')}
                            style={{ padding: '0.5rem 1rem' }}
                        >
                            <Save size={16} /> Salva
                        </button>
                        <button onClick={optimize} className="btn-secondary" disabled={optimizing}>
                            <Wand2 size={16} />
                            {optimizing ? 'Analisi...' : 'Migliora con IA'}
                        </button>
                    </div>
                </header>

                <textarea
                    value={localContent}
                    onChange={(e) => {
                        setLocalContent(e.target.value);
                        setSaveStatus('idle');
                    }}
                    placeholder="Inizia a scrivere il tuo capolavoro..."
                    style={{
                        flex: 1,
                        background: 'rgba(15, 23, 42, 0.3)',
                        padding: '2rem',
                        borderRadius: '12px',
                        color: '#e2e8f0',
                        fontSize: '1.1rem',
                        lineHeight: 1.8,
                        border: '1px solid var(--glass-border)',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'serif',
                        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)'
                    }}
                />
            </div>

            {/* Right: AI Editor */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
                    <FileEdit size={20} /> <span style={{ fontWeight: 600 }}>Agente Editor</span>
                </div>

                <div style={{ flex: 1 }}>
                    {suggestion ? (
                        <div className="fade-in" style={{ background: 'rgba(79, 70, 229, 0.05)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--accent)' }}>
                            <p style={{ fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.6, color: '#e2e8f0', minHeight: '100px' }}>
                                {suggestion}
                            </p>
                            <div style={{ display: 'flex', gap: '0.8rem' }}>
                                <button className="btn-primary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={applySuggestion}>
                                    <Check size={16} /> Applica
                                </button>
                                <button className="btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={() => setSuggestion(null)}>
                                    <X size={16} /> Ignora
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                <Wand2 size={24} color="var(--text-muted)" />
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                Seleziona un capitolo e usa l'ottimizzazione per ricevere suggerimenti stilistici.
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--glass-border)' }}>
                    <button
                        className="btn-primary"
                        style={{ width: '100%', padding: '1rem' }}
                        onClick={async () => {
                            if (bookId) {
                                await supabase.from('books').update({ status: 'EXPORT' }).eq('id', bookId);
                            }
                            navigate('/create/export');
                        }}
                    >
                        Procedi all'Export <ChevronRight size={18} />
                    </button>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
                        Tutti i capitoli verranno salvati automaticamente.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default EditorPage;
