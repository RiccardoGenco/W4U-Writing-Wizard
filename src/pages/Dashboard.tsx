import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { supabase } from '../lib/api';
import { getGenresByCategory } from '../data/genres';
import { useWallet } from '../lib/useWallet';
import { usePricing } from '../lib/usePricing';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [pages, setPages] = useState('50');
    const [theme, setTheme] = useState('Giallo e Thriller');
    const [showForm, setShowForm] = useState(false);

    // --- Gatekeeping Logic ---
    const { loading: walletLoading, getBalance } = useWallet();
    const { config, calculateTotal } = usePricing();
    const [showTokenAlert, setShowTokenAlert] = useState(false);

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
                                        background: 'linear-gradient(to right, var(--text-main), var(--primary))',
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

                                <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '4rem', flexDirection: 'column', alignItems: 'center' }}>
                                    <motion.button
                                        whileHover={!walletLoading ? { scale: 1.05, y: -5 } : {}}
                                        whileTap={!walletLoading ? { scale: 0.95 } : {}}
                                        className="btn-primary"
                                        style={{ fontSize: '1.2rem', padding: '1.4rem 3rem' }}
                                        onClick={() => {
                                            if (walletLoading) return;
                                            if (canStartForm) {
                                                setShowForm(true);
                                                setShowTokenAlert(false);
                                            } else {
                                                setShowTokenAlert(true);
                                            }
                                        }}
                                        disabled={walletLoading}
                                    >
                                        {walletLoading ? <Loader2 className="animate-spin" /> : <><Plus size={24} /> Inizia Ora</>}
                                    </motion.button>

                                    {/* Gatekeeping Alert */}
                                    {showTokenAlert && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            style={{
                                                background: 'rgba(251, 113, 133, 0.1)',
                                                border: '1px solid rgba(251, 113, 133, 0.3)',
                                                padding: '1.5rem',
                                                borderRadius: '16px',
                                                maxWidth: '500px',
                                                textAlign: 'center'
                                            }}
                                        >
                                            <p style={{ color: 'var(--text-main)', marginBottom: '1rem', fontWeight: 600 }}>
                                                Credito Insufficiente.
                                            </p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                                Il costo minimo per generare un libro è di {baseCost}€, ma il tuo saldo attuale è di {getBalance()}€. Ricarica il tuo Wallet per iniziare.
                                            </p>
                                            <button
                                                onClick={() => navigate('/pricing')}
                                                className="btn-primary"
                                                style={{ padding: '0.8rem 2rem', fontSize: '1rem' }}
                                            >
                                                Ricarica Credito
                                            </button>
                                        </motion.div>
                                    )}
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
                                                setShowTokenAlert(false);
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
                                        Credito insufficiente per generare {pages} pagine. Riduci le pagine o ricarica il wallet.
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

export default Dashboard;
