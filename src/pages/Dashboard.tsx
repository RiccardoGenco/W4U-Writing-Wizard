import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { supabase } from '../lib/api';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [pages, setPages] = useState('150');
    const [theme, setTheme] = useState('Thriller');
    const [showForm, setShowForm] = useState(false);

    const PAGE_OPTIONS = ['50', '100', '150', '200', '250', '300'];
    const GENRE_OPTIONS = [
        'Thriller', 'Noir', 'Fantasy', 'Romanzo Rosa',
        'Fantascienza', 'Storico', 'Horror', 'Saggio', 'Giallo'
    ];

    // Interactive Background Logic
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const springConfig = { damping: 25, stiffness: 150 };
    const dotX = useSpring(mouseX, springConfig);
    const dotY = useSpring(mouseY, springConfig);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mouseX.set(e.clientX);
            mouseY.set(e.clientY);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    const createProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const chapterCount = Math.max(5, Math.min(30, Math.ceil(parseInt(pages || '100') / 20)));
            const { data, error } = await supabase
                .from('books')
                .insert([{
                    status: 'INTERVIEW',
                    title: title || 'Nuovo Progetto',
                    genre: theme,
                    target_chapters: chapterCount,
                    context_data: { target_pages: pages, initial_theme: theme }
                }])
                .select().single();

            if (error) throw error;
            if (data) {
                localStorage.setItem('active_book_id', data.id);
                navigate('/create/concept');
            }
        } catch (err) {
            console.error("Error creating project:", err);
            alert("Errore nella creazione del progetto.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Interactive Background Elements */}
            <div className="interactive-bg">
                <motion.div
                    className="bg-dot"
                    style={{
                        width: '400px',
                        height: '400px',
                        left: -200,
                        top: -200,
                        x: dotX,
                        y: dotY,
                        opacity: 0.2
                    }}
                />
                <motion.div
                    className="bg-dot"
                    style={{
                        width: '300px',
                        height: '300px',
                        right: 100,
                        bottom: 100,
                        background: 'var(--accent)',
                        opacity: 0.1,
                        scale: 1.2
                    }}
                    animate={{
                        y: [0, 50, 0],
                        scale: [1, 1.1, 1]
                    }}
                    transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            </div>

            <div className="container-narrow fade-in" style={{ height: '100%', overflowY: 'auto', padding: '4rem 0', position: 'relative' }}>

                <div style={{ textAlign: 'center', maxWidth: '800px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                    >
                        {!showForm ? (
                            <>
                                <motion.div
                                    style={{
                                        background: 'rgba(0, 242, 255, 0.05)',
                                        display: 'inline-flex',
                                        padding: '2rem',
                                        borderRadius: '30px',
                                        marginBottom: '2rem',
                                        border: '1px solid rgba(0, 242, 255, 0.1)'
                                    }}
                                    whileHover={{ rotate: 5, scale: 1.1 }}
                                >
                                    <BookOpen size={64} color="var(--primary)" />
                                </motion.div>

                                <h1 style={{ fontSize: '4rem', marginBottom: '1.5rem', lineHeight: 1.1, letterSpacing: '-0.05em' }}>
                                    Scrivi il tuo <br />
                                    <span style={{
                                        background: 'linear-gradient(to right, #ffffff, var(--primary))',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        filter: 'drop-shadow(0 0 10px rgba(0, 242, 255, 0.3))'
                                    }}>
                                        Capolavoro
                                    </span>
                                </h1>

                                <p style={{ color: 'var(--text-muted)', fontSize: '1.4rem', marginBottom: '4rem', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 4rem' }}>
                                    L'intelligenza artificiale al servizio della tua creatività. <br />
                                    Dallo schema alla bozza finale.
                                </p>

                                <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '4rem' }}>
                                    <motion.button
                                        whileHover={{ scale: 1.05, y: -5 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="btn-primary"
                                        style={{ fontSize: '1.2rem', padding: '1.4rem 3rem' }}
                                        onClick={() => setShowForm(true)}
                                    >
                                        <Plus size={24} /> Inizia Ora
                                    </motion.button>
                                </div>


                            </>
                        ) : (
                            <motion.form
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                onSubmit={createProject}
                                className="glass-panel"
                                style={{ textAlign: 'left', padding: '3rem', maxWidth: '600px', margin: '0 auto' }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginBottom: '2rem', cursor: 'pointer', padding: 0, fontSize: '1rem' }}
                                >
                                    ← Torna alla Dashboard
                                </button>
                                <h2 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Nuovo Progetto</h2>

                                <div style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Titolo</label>
                                    <input
                                        required
                                        placeholder="Es. L'ombra del tempo"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Pagine</label>
                                        <select
                                            value={pages}
                                            onChange={e => setPages(e.target.value)}
                                            style={{ width: '100%' }}
                                        >
                                            {PAGE_OPTIONS.map(opt => (
                                                <option key={opt} value={opt}>{opt} pagine</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Genere</label>
                                        <select
                                            value={theme}
                                            onChange={e => setTheme(e.target.value)}
                                            style={{ width: '100%' }}
                                        >
                                            {GENRE_OPTIONS.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '1.2rem' }}
                                    disabled={loading || !title || !theme}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : 'Crea il tuo Libro'}
                                </button>
                            </motion.form>
                        )}
                    </motion.div>
                </div>
            </div>
        </>
    );
};

export default Dashboard;
