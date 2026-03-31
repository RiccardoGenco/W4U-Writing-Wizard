import React, { useState, useEffect } from 'react';
import { 
    User, 
    Mail, 
    Shield, 
    AlertTriangle, 
    Save, 
    Loader2, 
    LifeBuoy, 
    Clock, 
    Zap, 
    BookOpen, 
    Layers, 
    History, 
    CheckCircle,
    CreditCard
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useWallet } from '../lib/useWallet';
import { supabase } from '../lib/api';
import { motion } from 'framer-motion';
import { Toast } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import { SupportModal } from '../components/SupportModal';

const AccountPage: React.FC = () => {
    const { user, updatePassword, updateEmail, updateMetadata } = useAuth();
    const { wallet } = useWallet();
    
    // Profile State
    const [authorName, setAuthorName] = useState(user?.user_metadata?.author_name || '');
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState(false);

    // Security State
    const [newEmail, setNewEmail] = useState(user?.email || '');
    const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
    const [emailSuccess, setEmailSuccess] = useState(false);

    const [newPassword, setNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Stats State
    const [stats, setStats] = useState({ books: 0, chapters: 0 });
    const [loadingStats, setLoadingStats] = useState(true);

    // Transactions State
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    
    // Support Modal & Toasts
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
    const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([]);

    const addToast = (message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    useEffect(() => {
        if (user) {
            fetchStats();
            fetchTransactions();
        }
    }, [user]);

    const fetchStats = async () => {
        try {
            setLoadingStats(true);
            const [{ count: booksCount }, { count: chaptersCount }] = await Promise.all([
                supabase.from('books').select('*', { count: 'exact', head: true }).eq('user_id', user?.id),
                supabase.from('chapters').select('*, books!inner(*)', { count: 'exact', head: true }).eq('books.user_id', user?.id)
            ]);
            setStats({ books: booksCount || 0, chapters: chaptersCount || 0 });
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoadingStats(false);
        }
    };

    const fetchTransactions = async () => {
        try {
            setLoadingTransactions(true);
            const { data, error: err } = await supabase
                .from('transactions_log')
                .select('*')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (err) throw err;
            setTransactions(data || []);
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoadingTransactions(false);
        }
    };

    const handleUpdateProfile = async () => {
        setIsUpdatingProfile(true);
        setProfileSuccess(false);
        setError(null);
        const { error: err } = await updateMetadata({ author_name: authorName });
        if (err) setError(err);
        else {
            setProfileSuccess(true);
            setTimeout(() => setProfileSuccess(false), 3000);
        }
        setIsUpdatingProfile(false);
    };

    const handleUpdateEmail = async () => {
        setIsUpdatingEmail(true);
        setEmailSuccess(false);
        setError(null);
        const { error: err } = await updateEmail(newEmail);
        if (err) setError(err);
        else {
            setEmailSuccess(true);
            setTimeout(() => setEmailSuccess(false), 3000);
        }
        setIsUpdatingEmail(false);
    };

    const handleUpdatePassword = async () => {
        setIsUpdatingPassword(true);
        setPasswordSuccess(false);
        setError(null);
        const { error: err } = await updatePassword(newPassword);
        if (err) setError(err);
        else {
            setPasswordSuccess(true);
            setNewPassword('');
            setTimeout(() => setPasswordSuccess(false), 3000);
        }
        setIsUpdatingPassword(false);
    };



    return (
        <div className="container-narrow fade-in" style={{ padding: '3rem 0' }}>
            <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Il mio Account</h1>
                <p style={{ color: 'var(--text-muted)' }}>Gestisci la tua identità e controlla i tuoi movimenti.</p>
            </div>

            {error && (
                <div className="glass-panel" style={{ 
                    padding: '1rem', marginBottom: '2rem', border: '1px solid var(--error)', 
                    color: 'var(--error)', background: 'rgba(251, 113, 133, 0.05)', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '0.75rem'
                }}>
                    <AlertTriangle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {user?.new_email && (
                <div className="glass-panel" style={{ 
                    padding: '1rem', marginBottom: '2rem', border: '1px solid var(--primary)', 
                    color: 'var(--primary)', background: 'rgba(0, 242, 255, 0.05)', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '0.75rem'
                }}>
                    <Clock size={20} className="animate-pulse" />
                    <div style={{ fontSize: '0.9rem' }}>
                        <p style={{ fontWeight: 600 }}>Modifica email in sospeso</p>
                        <p style={{ opacity: 0.8 }}>Controlla la nuova casella ({user.new_email}) e quella attuale per confermare il cambio.</p>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                
                {/* --- SEZIONE STATS --- */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel" 
                        style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}
                    >
                        <div style={{ background: 'rgba(0, 242, 255, 0.1)', padding: '1rem', borderRadius: '12px' }}>
                            <BookOpen size={24} color="var(--primary)" />
                        </div>
                        <div>
                            <p style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{loadingStats ? '...' : stats.books}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>LIBRI CREATI</p>
                        </div>
                    </motion.div>
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-panel" 
                        style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}
                    >
                        <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '1rem', borderRadius: '12px' }}>
                            <Layers size={24} color="#a855f7" />
                        </div>
                        <div>
                            <p style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{loadingStats ? '...' : stats.chapters}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>CAPITOLI SCRITTI</p>
                        </div>
                    </motion.div>
                </div>

                {/* --- SEZIONE PROFILO --- */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <User size={20} />
                        </div>
                        <h3 style={{ fontSize: '1.4rem' }}>Firma</h3>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'flex-end' }}>
                        <div className="form-group">
                            <label className="input-label">Firma predefinita</label>
                            <input 
                                type="text"
                                className="input-field" 
                                value={authorName}
                                onChange={(e) => setAuthorName(e.target.value)}
                                placeholder="Es. Mario Rossi"
                            />
                        </div>
                        <button 
                            className="btn-primary" 
                            style={{ height: '48px', width: 'fit-content', padding: '0 2rem' }}
                            onClick={handleUpdateProfile}
                            disabled={isUpdatingProfile}
                        >
                            {isUpdatingProfile ? <Loader2 className="animate-spin" size={20} /> : (profileSuccess ? <><CheckCircle size={18} /> Salvato</> : <><Save size={18} /> Salva Firma</>)}
                        </button>
                    </div>
                </div>

                {/* --- SEZIONE SICUREZZA --- */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem' }}>
                        <Shield size={22} color="var(--primary)" />
                        <h3 style={{ fontSize: '1.4rem' }}>Sicurezza</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Email */}
                        <div className="form-group">
                            <label className="input-label">Indirizzo Email</label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="email"
                                    className="input-field" 
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                />
                                <button 
                                    onClick={handleUpdateEmail}
                                    disabled={isUpdatingEmail || newEmail === user?.email}
                                    style={{ 
                                        position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                                        background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '0.4rem 1rem', fontSize: '0.75rem', cursor: 'pointer', opacity: (isUpdatingEmail || newEmail === user?.email) ? 0.5 : 1
                                    }}
                                >
                                    {isUpdatingEmail ? <Loader2 className="animate-spin" size={14} /> : (emailSuccess ? <CheckCircle size={14} /> : 'Aggiorna')}
                                </button>
                            </div>
                        </div>

                        {/* Password */}
                        <div className="form-group">
                            <label className="input-label">Nuova Password</label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="password"
                                    className="input-field" 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimo 6 caratteri"
                                />
                                <button 
                                    onClick={handleUpdatePassword}
                                    disabled={isUpdatingPassword || newPassword.length < 6}
                                    style={{ 
                                        position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                                        background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '0.4rem 1rem', fontSize: '0.75rem', cursor: 'pointer', opacity: (isUpdatingPassword || newPassword.length < 6) ? 0.5 : 1
                                    }}
                                >
                                    {isUpdatingPassword ? <Loader2 className="animate-spin" size={14} /> : (passwordSuccess ? <CheckCircle size={14} /> : 'Cambia')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- SEZIONE BILLING & STORICO --- */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <CreditCard size={22} color="var(--primary)" />
                            <h3 style={{ fontSize: '1.4rem' }}>Portafoglio & Storico</h3>
                        </div>
                        <div style={{ 
                            background: 'rgba(0, 242, 255, 0.1)', border: '1px solid rgba(0, 242, 255, 0.2)',
                            padding: '0.5rem 1.5rem', borderRadius: '30px', fontWeight: 800, color: 'var(--primary)',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                             <Zap size={16} fill="var(--primary)" />
                             Saldo: €{(wallet?.balance ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            <History size={16} />
                            <span>Ultime 20 transazioni</span>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        <th style={{ padding: '0.5rem 1rem' }}>DATA</th>
                                        <th style={{ padding: '0.5rem 1rem' }}>DESCRIZIONE</th>
                                        <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>IMPORTO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingTransactions ? (
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: 'center', padding: '3rem' }}>
                                                <Loader2 className="animate-spin" style={{ margin: '0 auto' }} />
                                            </td>
                                        </tr>
                                    ) : (
                                        transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    Nessun movimento registrato.
                                                </td>
                                            </tr>
                                        ) : (
                                            transactions.map(t => (
                                                <tr key={t.id} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                                    <td style={{ padding: '1rem', color: 'var(--text-muted)', borderRadius: '12px 0 0 12px' }}>
                                                        {new Date(t.created_at).toLocaleDateString('it-IT')}
                                                    </td>
                                                    <td style={{ padding: '1rem', fontWeight: 500 }}>{t.description || 'Transazione generica'}</td>

                                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, color: t.amount > 0 ? 'var(--success)' : 'inherit', borderRadius: '0 12px 12px 0' }}>
                                                        {(t.amount > 0 ? '+' : '')}{(t.amount ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                                                    </td>
                                                </tr>
                                            ))
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* --- SEZIONE SUPPORTO & CONTATTI --- */}
                <div className="glass-panel" style={{ padding: '2rem', marginTop: '2rem', border: '1px solid rgba(0, 242, 255, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                        <Mail size={22} color="var(--primary)" />
                        <h3 style={{ fontSize: '1.4rem' }}>Supporto & Contatti</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                        <div>
                            <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Hai bisogno di assistenza?</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Per richieste di personalizzazione, problemi tecnici o eliminazione dell'account, contatta direttamente il nostro team.
                            </p>
                        </div>
                        <button 
                            onClick={() => setIsSupportModalOpen(true)}
                            className="btn-primary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', cursor: 'pointer', border: 'none' }}
                        >
                            Contatta Supporto <LifeBuoy size={16} />
                        </button>
                    </div>
                </div>

                {/* Support Modal */}
                <SupportModal 
                    isOpen={isSupportModalOpen}
                    onClose={() => setIsSupportModalOpen(false)}
                    onSuccess={(msg) => addToast(msg, 'success')}
                    onError={(msg) => addToast(msg, 'error')}
                />

                {/* Toast Container */}
                <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {toasts.map((toast) => (
                        <Toast 
                            key={toast.id}
                            id={toast.id}
                            message={toast.message}
                            type={toast.type}
                            onClose={removeToast}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AccountPage;
