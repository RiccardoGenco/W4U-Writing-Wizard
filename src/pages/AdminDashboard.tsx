import React, { useState, useEffect } from 'react';
import { Shield, Users, BookOpen, Coins, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/api';

interface UserCostStat {
    user_id: string;
    user_email?: string;
    author_name?: string;
    total_books_generated: number;
    total_requests: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_estimated_cost_eur: number;
}

interface BookCostStat {
    book_id: string;
    title: string;
    user_id: string;
    user_email?: string;
    author_name?: string;
    total_requests: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_estimated_cost_eur: number;
}

const AdminDashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [userStats, setUserStats] = useState<UserCostStat[]>([]);
    const [bookStats, setBookStats] = useState<BookCostStat[]>([]);
    const [isUserTableOpen, setIsUserTableOpen] = useState(true);
    const [isBookTableOpen, setIsBookTableOpen] = useState(true);

    useEffect(() => {
        fetchAdminData();
    }, []);

    const fetchAdminData = async () => {
        setLoading(true);
        try {
            const [userRes, bookRes] = await Promise.all([
                supabase.from('vw_cost_per_user').select('*').order('total_estimated_cost_eur', { ascending: false }),
                supabase.from('vw_cost_per_book').select('*').order('total_estimated_cost_eur', { ascending: false })
            ]);

            if (userRes.error) throw userRes.error;
            if (bookRes.error) throw bookRes.error;

            setUserStats(userRes.data || []);
            setBookStats(bookRes.data || []);
        } catch (err) {
            console.error("Error fetching admin stats:", err);
            // In a real app, use the Toast component here
            alert("Errore nel caricamento dei dati di amministrazione.");
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 }).format(value);
    };

    const formatNumber = (value: number) => {
        return new Intl.NumberFormat('it-IT').format(value);
    };

    // Calculate Totals
    const totalSystemCost = userStats.reduce((acc, curr) => acc + Number(curr.total_estimated_cost_eur), 0);
    const totalSystemTokens = userStats.reduce((acc, curr) => acc + Number(curr.total_tokens), 0);
    const totalSystemBooks = bookStats.length;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" />
            </div>
        );
    }

    return (
        <div className="container-narrow fade-in" style={{ padding: '2rem 4rem', maxWidth: '1200px', margin: '0 auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
                <div style={{ background: 'rgba(251, 113, 133, 0.1)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(251, 113, 133, 0.2)' }}>
                    <Shield size={32} color="var(--error)" />
                </div>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.2rem' }}>Pannello Amministratore</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Monitoraggio Costi AI e Utilizzo Sistema</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(0, 242, 255, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <Coins size={24} color="var(--primary)" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Costo Totale Sistema</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatCurrency(totalSystemCost)}</h3>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <BookOpen size={24} color="#a855f7" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Libri Totali DB</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatNumber(totalSystemBooks)}</h3>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <Users size={24} color="#22c55e" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Token Rete Generati</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatNumber(totalSystemTokens)}</h3>
                    </div>
                </div>
            </div>

            {/* User Costs Table */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', overflowX: 'auto', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isUserTableOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsUserTableOpen(!isUserTableOpen)}
                >
                    <Users size={20} color="var(--primary)" /> Costi per Utente Registrato
                    {isUserTableOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isUserTableOpen && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <th style={{ padding: '1rem 0.5rem' }}>Utente</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Libri Creazione</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Chiamate API</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Token Consumati</th>
                                <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Costo Stimato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {userStats.length > 0 ? userStats.map((stat, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <strong>{stat.author_name || stat.user_email || 'Utente Sconosciuto'}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{stat.user_id?.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_books_generated}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_requests}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{formatNumber(stat.total_tokens)}</td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(stat.total_estimated_cost_eur)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nessun dato disponibile</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Book Costs Table */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '4rem', overflowX: 'auto', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isBookTableOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsBookTableOpen(!isBookTableOpen)}
                >
                    <BookOpen size={20} color="#a855f7" /> Dettaglio Costi per Libro Singolo
                    {isBookTableOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isBookTableOpen && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <th style={{ padding: '1rem 0.5rem' }}>Titolo (ID)</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Utente Proprietario</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Chiamate API</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Token Consumati</th>
                                <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Costo Stimato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookStats.length > 0 ? bookStats.map((stat, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <strong>{stat.title || 'Senza Titolo'}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{stat.book_id.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        {stat.author_name || stat.user_email || (stat.user_id ? stat.user_id.substring(0, 8) + '...' : 'N/A')}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_requests}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{formatNumber(stat.total_tokens)}</td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(stat.total_estimated_cost_eur)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nessun dato disponibile</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

        </div>
    );
};

export default AdminDashboard;
