import React from 'react';
import { Book, Plus, History, Layout, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface Project {
    id: string;
    titolo: string;
}

interface SidebarProps {
    projects: Project[];
    onSelectProject: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ projects, onSelectProject }) => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <aside className="sidebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
                <div style={{ background: 'var(--primary)', padding: '0.4rem', borderRadius: '10px' }}>
                    <Book size={20} color="white" />
                </div>
                <h2 style={{ fontSize: '1.25rem' }}>GhostWriter</h2>
            </div>

            <button
                onClick={() => {
                    navigate('/');
                }}
                className="btn-primary"
                style={{ width: '100%', marginBottom: '2rem', padding: '0.6rem' }}
            >
                <Plus size={18} /> Nuovo Libro
            </button>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '1rem', paddingLeft: '0.5rem' }}>
                    I TUOI PROGETTI
                </p>
                {projects.map(p => (
                    <div
                        key={p.id}
                        className={`sidebar-item ${location.pathname.includes(p.id) ? 'active' : ''}`}
                        onClick={() => onSelectProject(p.id)}
                    >
                        <History size={16} />
                        <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.titolo}
                        </span>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
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
