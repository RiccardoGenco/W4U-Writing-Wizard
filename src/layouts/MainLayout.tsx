import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

interface Project {
    id: string;
    titolo: string;
}

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('progetti_libri')
            .select('id, titolo')
            .order('created_at', { ascending: false });

        if (data) setProjects(data);
    };

    const handleSelectProject = (id: string) => {
        // For now, navigating to production as a fallback for viewing valid projects
        // In the full implementation, we'd check the project state (concept, blueprint, etc.)
        // But the user asked for specific routes for creation. 
        // Viewing old projects might need a dedicated Viewer page.
        // For now, let's assume we go to production view to see chapters/content.
        localStorage.setItem('active_book_id', id);
        // We probably need to fetch the project data again in the target page, 
        // but for now let's just navigate.
        navigate('/create/production');
    };

    return (
        <div className="layout-container">
            <Sidebar
                projects={projects}
                onSelectProject={handleSelectProject}
            />
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
