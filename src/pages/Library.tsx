import React, { useState, useEffect } from 'react';
import { Book, Plus, Loader2, Download, BookOpen, Clock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/api';
import { getRouteByStatus } from '../lib/navigation';

interface BookProject {
    id: string;
    title: string;
    author: string;
    genre: string;
    status: string;
    cover_url: string | null;
    created_at: string;
    target_pages: number;
}

const Library: React.FC = () => {
    const navigate = useNavigate();
    const [books, setBooks] = useState<BookProject[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('books')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBooks(data || []);
        } catch (err) {
            console.error("Error fetching library:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBook = (book: BookProject) => {
        localStorage.setItem('active_book_id', book.id);
        navigate(getRouteByStatus(book.status));
    };

    const handleDownload = (id: string) => {
        localStorage.setItem('active_book_id', id);
        navigate('/create/export');
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'EXPORT':
            case 'COVER':
                return {
                    icon: <CheckCircle size={14} />,
                    label: 'Completato',
                    color: 'var(--success)',
                    bg: 'rgba(52, 211, 153, 0.1)'
                };
            case 'PRODUCTION':
                return {
                    icon: <Loader2 size={14} className="animate-spin" />,
                    label: 'In Scrittura',
                    color: 'var(--primary)',
                    bg: 'rgba(0, 242, 255, 0.1)'
                };
            default:
                return {
                    icon: <Clock size={14} />,
                    label: 'In Bozza',
                    color: 'var(--text-muted)',
                    bg: 'rgba(255, 255, 255, 0.05)'
                };
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ padding: '4rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>La tua Libreria</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Tutti i tuoi progetti letterari in un unico posto.</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="btn-primary"
                    onClick={() => navigate('/create')}
                    style={{ padding: '0.8rem 1.5rem', borderRadius: '12px' }}
                >
                    <Plus size={18} /> Nuovo Libro
                </motion.button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10rem 0' }}>
                    <Loader2 className="animate-spin" size={48} color="var(--primary)" />
                </div>
            ) : books.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel" 
                    style={{ textAlign: 'center', padding: '6rem 2rem' }}
                >
                    <Book size={64} color="var(--text-muted)" style={{ marginBottom: '2rem', opacity: 0.3 }} />
                    <h2 style={{ marginBottom: '1rem' }}>Ancora nessun libro</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '400px', margin: '0 auto 2.5rem' }}>
                        Non hai ancora creato nessun libro. Inizia ora il tuo primo capolavoro!
                    </p>
                    <button onClick={() => navigate('/create')} className="btn-primary" style={{ padding: '1rem 3rem' }}>
                        Inizia il tuo primo Libro
                    </button>
                </motion.div>
            ) : (
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                    gap: '2rem' 
                }}>
                    <AnimatePresence>
                        {books.map((book, index) => {
                            const badge = getStatusBadge(book.status);
                            const isFinished = book.status === 'EXPORT' || book.status === 'COVER';

                            return (
                                <motion.div
                                    key={book.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="glass-panel"
                                    style={{ 
                                        padding: 0, 
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        height: '100%',
                                        position: 'relative'
                                    }}
                                >
                                    {/* Cover / Header Area */}
                                    <div style={{ 
                                        height: '180px', 
                                        background: book.cover_url ? `url(${book.cover_url})` : 'linear-gradient(135deg, var(--bg-dark), var(--primary-dark))',
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {!book.cover_url && <BookOpen size={48} color="rgba(0, 242, 255, 0.2)" />}
                                        <div style={{
                                            position: 'absolute',
                                            top: '1rem',
                                            right: '1rem',
                                            background: badge.bg,
                                            color: badge.color,
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            backdropFilter: 'blur(10px)',
                                            border: `1px solid ${badge.color}33`
                                        }}>
                                            {badge.icon} {badge.label}
                                        </div>
                                    </div>

                                    {/* Content Area */}
                                    <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.4rem', color: 'var(--text-main)' }}>{book.title}</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>di {book.author}</p>
                                        
                                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span>{book.genre}</span>
                                            <span>•</span>
                                            <span>{book.target_pages} pagine</span>
                                        </div>

                                        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.8rem' }}>
                                            <button 
                                                onClick={() => handleOpenBook(book)}
                                                className={isFinished ? "btn-secondary" : "btn-primary"}
                                                style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}
                                            >
                                                {isFinished ? 'Revisiona' : 'Continua'}
                                            </button>
                                            
                                            {isFinished && (
                                                <button 
                                                    onClick={() => handleDownload(book.id)}
                                                    className="btn-primary"
                                                    style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}
                                                >
                                                    <Download size={16} /> Scarica
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default Library;
