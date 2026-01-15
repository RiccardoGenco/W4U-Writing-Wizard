import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reorder, useDragControls, motion } from 'framer-motion';
import { GripVertical, Trash2, Plus, CheckCircle, Smartphone, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

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

    useEffect(() => {
        // Load generated outline from previous step
        const saved = localStorage.getItem('project_chapters');
        if (saved) {
            try {
                setChapters(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse chapters", e);
            }
        }
    }, []);

    const addChapter = () => {
        const newChapter = {
            id: `new-${Date.now()}`,
            title: 'Nuovo Capitolo',
            summary: 'Descrizione del capitolo...'
        };
        setChapters([...chapters, newChapter]);
    };

    const removeChapter = (id: string) => {
        setChapters(chapters.filter(c => c.id !== id));
    };

    const handleConfirm = async () => {
        const bookId = localStorage.getItem('active_book_id');
        if (!bookId || chapters.length === 0) return;

        setSaving(true);
        try {
            // 1. Format chapters for DB
            const dbChapters = chapters.map((c, index) => ({
                book_id: bookId,
                chapter_number: index + 1,
                title: c.title,
                summary: c.summary,
                status: 'PENDING'
            }));

            // 2. Insert into Supabase
            // Note: We might want to clear old chapters if re-running, but for now assuming fresh insert
            const { error } = await supabase
                .from('chapters')
                .insert(dbChapters);

            if (error) throw error;

            // 3. Update Book State
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

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
            {/* Stepper */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem', justifyContent: 'center' }}>
                <div style={{ height: '4px', width: '40px', background: 'var(--success)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--success)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--primary)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
            </div>

            <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>L'Architetto ha disegnato questo.</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                    Questa è l'ossatura del tuo libro. Sposta, modifica o cancella i capitoli come preferisci.
                </p>
            </header>

            <Reorder.Group axis="y" values={chapters} onReorder={setChapters} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {chapters.map((chapter) => (
                    <Reorder.Item key={chapter.id} value={chapter} style={{ listStyle: 'none' }}>
                        <div className="glass-panel" style={{
                            padding: '1rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            cursor: 'grab',
                            background: 'rgba(30, 41, 59, 0.6)'
                        }}>
                            <GripVertical size={20} color="var(--text-muted)" style={{ cursor: 'grab' }} />

                            <div style={{ flex: 1 }}>
                                <input
                                    className="invisible-input"
                                    value={chapter.title}
                                    onChange={(e) => {
                                        const newChapters = chapters.map(c => c.id === chapter.id ? { ...c, title: e.target.value } : c);
                                        setChapters(newChapters);
                                    }}
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '1.1rem',
                                        marginBottom: '0.2rem',
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--text-main)'
                                    }}
                                />
                                <input
                                    className="invisible-input"
                                    value={chapter.summary}
                                    onChange={(e) => {
                                        const newChapters = chapters.map(c => c.id === chapter.id ? { ...c, summary: e.target.value } : c);
                                        setChapters(newChapters);
                                    }}
                                    style={{
                                        fontSize: '0.9rem',
                                        color: 'var(--text-muted)',
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0
                                    }}
                                />
                            </div>

                            <button
                                onClick={() => removeChapter(chapter.id)}
                                style={{ background: 'transparent', color: 'var(--error)', padding: '0.5rem' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </Reorder.Item>
                ))}
            </Reorder.Group>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={addChapter} className="btn-secondary" style={{ borderStyle: 'dashed' }}>
                    <Plus size={18} /> Aggiungi Capitolo
                </button>

                <button onClick={handleConfirm} className="btn-primary" style={{ padding: '0.8rem 2rem' }}>
                    <CheckCircle size={18} /> Conferma Struttura Finale
                </button>
            </div>
        </div>
    );
};

export default BlueprintPage;
