import React from 'react';
import { Plus, BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);

    // Form State
    const [title, setTitle] = React.useState('');
    const [pages, setPages] = React.useState('');
    const [theme, setTheme] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);

    // Helper to create project
    const createProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Calculate target chapters (approx 1 chapter every 20 pages)
            const chapterCount = Math.max(5, Math.min(30, Math.ceil(parseInt(pages || '100') / 20)));

            // 1. Create row in Supabase
            const { data, error } = await supabase
                .from('books')
                .insert([
                    {
                        status: 'INTERVIEW',
                        title: title || 'Nuovo Progetto',
                        genre: theme,
                        target_chapters: chapterCount,
                        context_data: {
                            target_pages: pages,
                            initial_theme: theme
                        }
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                // 2. Save ID and Navigate
                localStorage.setItem('active_book_id', data.id);
                navigate('/create/concept');
            }
        } catch (err) {
            console.error("Error creating project:", err);
            alert("Errore nella creazione del progetto. Controlla la console.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
            <div style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div style={{ background: 'rgba(79, 70, 229, 0.1)', display: 'inline-flex', padding: '1.5rem', borderRadius: '50%', marginBottom: '2rem' }}>
                        <BookOpen size={48} color="var(--primary)" />
                    </div>

                    <h1 style={{ fontSize: '3.5rem', marginBottom: '1.5rem', lineHeight: 1.1 }}>
                        Il tuo prossimo <br />
                        <span style={{ background: 'linear-gradient(to right, var(--primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Best Seller
                        </span>
                    </h1>

                    {!showForm ? (
                        <>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', marginBottom: '3rem', lineHeight: 1.6 }}>
                                Dall'idea alla pubblicazione. Un assistente AI che ti guida in ogni passo del processo creativo.
                            </p>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="btn-primary"
                                style={{ fontSize: '1.2rem', padding: '1.2rem 2.5rem', borderRadius: '50px', margin: '0 auto', boxShadow: '0 20px 25px -5px rgba(79, 70, 229, 0.4)' }}
                                onClick={() => setShowForm(true)}
                            >
                                <Plus size={24} style={{ marginRight: '10px' }} /> Inizia Nuovo Progetto
                            </motion.button>
                        </>
                    ) : (
                        <motion.form
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            onSubmit={createProject}
                            className="glass-panel"
                            style={{ textAlign: 'left', padding: '2rem' }}
                        >
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Titolo del Progetto</label>
                                <input
                                    className="input-field"
                                    required
                                    placeholder="Es. Le Cronache di Marte"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Pagine Previste</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        placeholder="Es. 200"
                                        value={pages}
                                        onChange={e => setPages(e.target.value)}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Tema / Genere</label>
                                    <input
                                        className="input-field"
                                        placeholder="Es. Fantascienza"
                                        value={theme}
                                        onChange={e => setTheme(e.target.value)}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn-primary"
                                style={{ width: '100%', padding: '1rem' }}
                                disabled={loading || !title || !theme}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'Crea Progetto'}
                            </button>
                        </motion.form>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default Dashboard;
