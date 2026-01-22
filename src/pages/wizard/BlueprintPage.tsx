import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { callBookAgent } from '../../lib/api';

interface Chapter {
    id: string;
    title: string;
    summary: string;
}

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

const BlueprintPage: React.FC = () => {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('project_chapters');
        if (saved) {
            try {
                setChapters(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse chapters", e);
            }
        }
    }, []);

    const handleConfirm = async () => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId || chapters.length === 0) return;

        setSaving(true);
        try {
            const dbChapters = chapters.map((c, index) => ({
                book_id: bookId,
                chapter_number: index + 1,
                title: c.title,
                summary: c.summary,
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

            navigate('/create/production');

        } catch (err) {
            console.error("Error saving blueprint:", err);
            alert("Errore salvataggio struttura.");
        } finally {
            setSaving(false);
        }
    };

    const handleRefreshOutline = async () => {
        if (!feedback) return;
        const bookId = localStorage.getItem('active_book_id');
        setRefreshing(true);
        try {
            const data = await callBookAgent('OUTLINE', {
                feedback,
                currentChapters: chapters.map(c => ({ title: c.title, summary: c.summary }))
            }, bookId);
            const resData = data.data || data;

            if (resData.bookId) {
                localStorage.setItem('active_book_id', resData.bookId);
            }

            if (resData.chapters) {
                const chaptersWithIds = resData.chapters.map((c: any, i: number) => ({
                    id: `chap-${i}-${Date.now()}`,
                    title: c.title,
                    summary: c.summary || c.scene_description
                }));
                setChapters(chaptersWithIds);
                localStorage.setItem('project_chapters', JSON.stringify(chaptersWithIds));
                setFeedback('');
            }
        } catch (err) {
            console.error(err);
            alert("Errore durante l'aggiornamento. Riprova.");
        } finally {
            setRefreshing(false);
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
                {chapters.map((chapter) => (
                    <div key={chapter.id} className="glass-panel" style={{
                        padding: '1rem 1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        background: 'rgba(30, 41, 59, 0.4)'
                    }}>
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
                    </div>
                ))}
            </div>

            <section className="glass-panel" style={{ marginTop: '3rem', padding: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    💡 Vuoi affinare la struttura?
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    L'IA manterrà il numero di capitoli fisso, ma può riorganizzare i temi o cambiare focus su tuo suggerimento.
                </p>
                <textarea
                    placeholder="Es: Rendi il capitolo 3 più cupo, oppure aggiungi un elemento horror nel capitolo finale..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        color: 'white',
                        minHeight: '100px',
                        marginBottom: '1rem',
                        resize: 'none'
                    }}
                />
                <button
                    onClick={handleRefreshOutline}
                    disabled={refreshing || !feedback}
                    className="btn-secondary"
                    style={{ width: '100%', padding: '0.8rem' }}
                >
                    {refreshing ? <><Loader2 className="animate-spin" /> Elaborazione...</> : 'Richiedi Modifiche all\'IA'}
                </button>
            </section>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleConfirm} className="btn-primary" disabled={saving} style={{ padding: '0.8rem 2rem' }}>
                    {saving ? <Loader2 className="animate-spin" /> : <><CheckCircle size={18} /> Conferma Struttura Finale</>}
                </button>
            </div>
        </div>
    );
};

export default BlueprintPage;
