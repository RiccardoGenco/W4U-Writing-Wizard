import React, { useEffect, useState, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { supabase } from '../lib/api';
import { getRouteByStatus } from '../lib/navigation';

interface Project {
    id: string;
    title: string;
}

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeBookPages, setActiveBookPages] = useState<number | null>(null);
    const [activeBookId, setActiveBookId] = useState<string | null>(localStorage.getItem('active_book_id'));
    const [switching, setSwitching] = useState(false);

    const fetchProjects = useCallback(async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('books')
            .select('id, title')
            .order('created_at', { ascending: false });

        if (data) setProjects(data);
    }, []);

    const fetchActiveBookDetails = useCallback(async () => {
        if (!supabase || !activeBookId) return;
        const { data } = await supabase
            .from('books')
            .select('context_data')
            .eq('id', activeBookId)
            .single();

        if (data?.context_data?.target_pages) {
            setActiveBookPages(parseInt(data.context_data.target_pages));
        }
    }, [activeBookId]);

    useEffect(() => {
        fetchProjects();
        // Sync state with localStorage and fetch project list if it changed
        const interval = setInterval(() => {
            const storedId = localStorage.getItem('active_book_id');
            if (storedId !== activeBookId) {
                setActiveBookId(storedId);
                fetchProjects(); // Refresh sidebar list when project changes
            }
        }, 1500);
        return () => clearInterval(interval);
    }, [activeBookId, fetchProjects]);

    useEffect(() => {
        if (activeBookId) {
            fetchActiveBookDetails();
        } else {
            setActiveBookPages(null);
        }
    }, [activeBookId, fetchActiveBookDetails]);

    const handleSelectProject = async (id: string) => {
        if (switching) return;
        setSwitching(true);
        try {
            const { data } = await supabase
                .from('books')
                .select('status')
                .eq('id', id)
                .single();

            localStorage.setItem('active_book_id', id);
            setActiveBookId(id);
            fetchProjects();

            if (data) {
                navigate(getRouteByStatus(data.status));
            } else {
                navigate('/create/concept');
            }
        } catch (err) {
            console.error("Error selecting project:", err);
        } finally {
            setSwitching(false);
        }
    };

    return (
        <div className="layout-container">
            <Sidebar
                projects={projects}
                onSelectProject={handleSelectProject}
                activeProjectId={activeBookId}
            />
            <main className="main-content">
                {activeBookPages && location.pathname !== '/' && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={{
                            position: 'fixed',
                            top: '2rem',
                            right: '2rem',
                            zIndex: 100,
                            background: 'rgba(5, 5, 5, 0.8)',
                            backdropFilter: 'blur(20px)',
                            padding: '0.8rem 1.5rem',
                            borderRadius: '20px',
                            border: '1px solid rgba(0, 242, 255, 0.2)',
                            color: 'var(--primary)',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.8rem',
                            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                            letterSpacing: '0.02em'
                        }}
                    >
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--primary)',
                            boxShadow: '0 0 10px var(--primary)'
                        }}></div>
                        Target: {activeBookPages} Pagine
                    </motion.div>
                )}
                {switching && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 className="animate-spin" size={48} color="var(--primary)" />
                    </div>
                )}
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
