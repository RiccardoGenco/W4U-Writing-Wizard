import React from 'react';
import { Book, Plus, History, Layout, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

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

    return (
        <aside className="sidebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
                <div style={{
                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                    padding: '0.5rem',
                    borderRadius: '12px',
                    boxShadow: '0 0 15px rgba(0, 242, 255, 0.3)'
                }}>
                    <Book size={20} color="black" />
                </div>
                <h2 style={{ fontSize: '1.4rem', letterSpacing: '-0.05em', color: 'white' }}>W4U Wizard</h2>
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
                    overflowX: 'hidden',     // ← Aggiungi questo
                    scrollbarWidth: 'none'   // ← Aggiungi questo se vuoi nascondere anche quella verticale
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
                            minWidth: 0,        // ← Aggiungi questo
                            overflow: 'hidden'  // ← Aggiungi questo
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
                            flex: 1,        // ← Aggiungi questo
                            minWidth: 0     // ← Aggiungi questo
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
            </div>
        </aside>
    );
};

export default Sidebar;
