import React, { useState, useEffect } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { supabase } from '../../lib/api';
import { getGenresByCategory } from '../../data/genres';
import { useWallet } from '../../lib/useWallet';
import { usePricing } from '../../lib/usePricing';

const SetupPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [pages, setPages] = useState('50');
    const [theme, setTheme] = useState('Giallo e Thriller');

    // --- Gatekeeping Logic ---
    const { loading: walletLoading, getBalance } = useWallet();
    const { config, calculateTotal } = usePricing();

    const PAGE_OPTIONS = config
        ? Array.from(
            { length: Math.floor((config.max_pages - config.base_pages) / config.extra_pages_increment) + 1 },
            (_, i) => (config.base_pages + i * config.extra_pages_increment).toString()
        )
        : ['50', '100', '150', '200', '250', '300'];

    const currentCost = calculateTotal(parseInt(pages));
    const baseCost = config?.base_price_eur || 30;
    const canStartForm = getBalance() >= baseCost;
    const hasEnoughCredit = getBalance() >= currentCost;
    const categorizedGenres = getGenresByCategory();

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
            const chapterCount = Math.max(2, Math.min(30, Math.ceil(parseInt(pages || '100') / 20)));
            const { data, error } = await supabase
                .from('books')
                .insert([{
                    status: 'INTERVIEW',
                    title: title || 'Nuovo Progetto',
                    author: author || 'Anonimo',
                    genre: theme,
                    target_chapters: chapterCount,
                    target_pages: pages,
                    context_data: { initial_theme: theme }
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
            </div>

            <div className="container-narrow fade-in" style={{ height: '100%', overflowY: 'auto', padding: '4rem 0', position: 'relative' }}>

                <div style={{ textAlign: 'center', maxWidth: '800px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                    >
                        {/* Always show the form now, but keep the gatekeeping logic */}
                        {(!canStartForm && !walletLoading) ? (
                            <div style={{ padding: '4rem 0' }}>
                                <motion.div
                                    style={{
                                        background: 'rgba(251, 113, 133, 0.05)',
                                        display: 'inline-flex',
                                        padding: '2rem',
                                        borderRadius: '30px',
                                        marginBottom: '2rem',
                                        border: '1px solid rgba(251, 113, 133, 0.1)'
                                    }}
                                >
                                    <BookOpen size={64} color="var(--error)" />
                                </motion.div>
                                <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>Credito Necessario</h1>
                                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '3rem' }}>
                                    Il costo base per iniziare un nuovo libro è di {baseCost}€. <br />
                                    Il tuo saldo attuale è di {getBalance()}€.
                                </p>
                                <button onClick={() => navigate('/pricing')} className="btn-primary" style={{ padding: '1rem 3rem' }}>
                                    Ricarica Credito
                                </button>
                            </div>
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
                                    onClick={() => navigate('/')}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginBottom: '2rem', cursor: 'pointer', padding: 0, fontSize: '1rem' }}
                                >
                                    ← Torna alla Libreria
                                </button>
                                <h2 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Nuovo Libro</h2>

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

                                <div style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Nome Autore</label>
                                    <input
                                        required
                                        placeholder="Es. Riccardo Genco"
                                        value={author}
                                        onChange={e => setAuthor(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                    <div>
                                        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                            <span>Pagine Libro</span>
                                            <span style={{ color: hasEnoughCredit ? 'var(--primary)' : 'var(--error)' }}>Costo: €{currentCost}</span>
                                        </label>
                                        <select
                                            value={pages}
                                            onChange={e => {
                                                setPages(e.target.value);
                                            }}
                                            style={{ width: '100%', borderColor: !hasEnoughCredit ? 'var(--error)' : undefined }}
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
                                            {Object.entries(categorizedGenres).map(([category, genres]) => (
                                                <optgroup key={category} label={category}>
                                                    {genres.map(g => (
                                                        <option key={g.label} value={g.label}>{g.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '1.2rem', opacity: hasEnoughCredit ? 1 : 0.5 }}
                                    disabled={loading || !title || !theme || !hasEnoughCredit}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : 'Crea il tuo Libro'}
                                </button>
                                {!hasEnoughCredit && (
                                    <p style={{ color: 'var(--error)', textAlign: 'center', marginTop: '1rem', fontWeight: 500, fontSize: '0.9rem' }}>
                                        Credito insufficiente per generare {pages} pagine.
                                    </p>
                                )}
                            </motion.form>
                        )}
                    </motion.div>
                </div>
            </div>
        </>
    );
};

export default SetupPage;
