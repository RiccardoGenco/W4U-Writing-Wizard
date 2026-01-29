import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import { supabase } from '../lib/api';

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
    }, [activeBookId]);

    useEffect(() => {
        if (activeBookId) {
            fetchActiveBookDetails();
        } else {
            setActiveBookPages(null);
        }
    }, [activeBookId]);

    const fetchProjects = async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('books')
            .select('id, title')
            .order('created_at', { ascending: false });

        if (data) setProjects(data);
    };

    const fetchActiveBookDetails = async () => {
        if (!supabase || !activeBookId) return;
        const { data } = await supabase
            .from('books')
            .select('context_data')
            .eq('id', activeBookId)
            .single();

        if (data?.context_data?.target_pages) {
            setActiveBookPages(parseInt(data.context_data.target_pages));
        }
    };

    const handleSelectProject = (id: string) => {
        localStorage.setItem('active_book_id', id);
        setActiveBookId(id);
        fetchProjects(); // Refresh list to ensure titles are up to date

        navigate('/create/production');
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
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
