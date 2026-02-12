import React, { useState } from 'react';
import { Book, Plus, History, Layout, Settings, LogOut, User, AlertCircle, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/useTheme';

interface Project {
    id: string;
    title: string;
}

interface SidebarProps {
    projects: Project[];
    onSelectProject: (id: string) => void;
    activeProjectId?: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({ projects, onSelectProject, activeProjectId }) => {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const { toggleTheme, isDark } = useTheme();
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState(false);

    const handleSignOut = async () => {
        console.log('[Sidebar] Sign out clicked for:', user?.email);
        setSigningOut(true);
        setSignOutError(false);

        try {
            await signOut();
            console.log('[Sidebar] Sign out completed — navigating to /login');
            navigate('/login');
        } catch (err: any) {
            console.error('[Sidebar] Sign out failed:', err.message);
            setSignOutError(true);
            setSigningOut(false);

            // Auto-clear error after 4 seconds
            setTimeout(() => setSignOutError(false), 4000);
        }
    };

    return (
        <aside className="sidebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
                <div style={{
                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                    padding: '0.5rem',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-primary)'
                }}>
                    <Book size={20} color="var(--text-on-primary)" />
                </div>
                <h2 style={{ fontSize: '1.4rem', letterSpacing: '-0.05em', color: 'var(--text-main)' }}>W4U Wizard</h2>
            </div>

            <button
                onClick={() => {
                    navigate('/');
                }}
                className="btn-primary"
                style={{ width: '100%', marginBottom: '2.5rem', padding: '0.8rem', borderRadius: '16px' }}
            >
                <Plus size={18} /> Nuovo Libro
            </button>

            <div style=
                {{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    scrollbarWidth: 'none'
                }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '1.2rem', paddingLeft: '0.5rem', opacity: 0.6 }}>
                    PROGETTI RECENTI
                </p>
                {projects.map(p => (
                    <div
                        key={p.id}
                        className={`sidebar-item ${activeProjectId === p.id ? 'active' : ''}`}
                        onClick={() => onSelectProject(p.id)}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            minWidth: 0,
                            overflow: 'hidden'
                        }}
                    >
                        {activeProjectId === p.id && (
                            <motion.div
                                layoutId="active-pill"
                                style={{ position: 'absolute', left: 0, width: '3px', height: '60%', background: 'var(--primary)', borderRadius: '0 4px 4px 0' }}
                            />
                        )}
                        <History size={16} style={{ flexShrink: 0, minWidth: '16px', minHeight: '16px' }} />
                        <span style={{
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: activeProjectId === p.id ? 600 : 400,
                            flex: 1,
                            minWidth: 0
                        }}>
                            {p.title}
                        </span>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', gap: '0.2rem', display: 'flex', flexDirection: 'column' }}>
                <div className="sidebar-item" onClick={() => navigate('/')}>
                    <Layout size={18} /> <span>Dashboard</span>
                </div>
                <div className="sidebar-item">
                    <Settings size={18} /> <span>Impostazioni</span>
                </div>
                <div className="sidebar-item" onClick={toggleTheme} style={{ cursor: 'pointer' }}>
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    <span>{isDark ? 'Tema Chiaro' : 'Tema Scuro'}</span>
                </div>

                {/* User section */}
                {user && (
                    <div style={{
                        marginTop: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--glass-border)'
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            padding: '0.5rem 0.5rem', marginBottom: '0.5rem'
                        }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'rgba(0, 242, 255, 0.1)',
                                border: '1px solid rgba(0, 242, 255, 0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <User size={14} color="var(--primary)" />
                            </div>
                            <span style={{
                                fontSize: '0.75rem', color: 'var(--text-muted)',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap', flex: 1, minWidth: 0
                            }}>
                                {user.user_metadata?.author_name || user.email}
                            </span>
                        </div>

                        {/* Sign out error message */}
                        {signOutError && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.4rem 0.5rem', marginBottom: '0.4rem',
                                fontSize: '0.7rem', color: 'var(--error)',
                                background: 'rgba(251, 113, 133, 0.08)',
                                borderRadius: '8px'
                            }}>
                                <AlertCircle size={12} />
                                <span>Errore durante il logout</span>
                            </div>
                        )}

                        <div
                            className="sidebar-item"
                            onClick={signingOut ? undefined : handleSignOut}
                            style={{
                                color: 'var(--error)',
                                opacity: signingOut ? 0.5 : 1,
                                pointerEvents: signingOut ? 'none' : 'auto'
                            }}
                        >
                            {signingOut ? (
                                <div className="animate-spin" style={{
                                    width: 16, height: 16,
                                    border: '2px solid rgba(251, 113, 133, 0.3)',
                                    borderTopColor: 'var(--error)',
                                    borderRadius: '50%'
                                }} />
                            ) : (
                                <LogOut size={16} />
                            )}
                            <span style={{ fontSize: '0.85rem' }}>
                                {signingOut ? 'Uscita...' : 'Esci'}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
