import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAdmin, loading, user } = useAuth();

    if (loading) {
        return (
            <div style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-dark)', flexDirection: 'column', gap: '1.5rem'
            }}>
                <div className="cyber-spinner">
                    <div className="spinner-ring" />
                    <div className="spinner-ring" />
                    <div className="spinner-core" />
                </div>
                <p style={{
                    color: 'var(--text-muted)', fontSize: '0.9rem',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    Verifica autorizzazione admin...
                </p>
            </div>
        );
    }

    if (!user || !isAdmin) {
        console.warn(`[AdminGuard] Access denied — user: ${user?.email ?? 'none'}, isAdmin: ${isAdmin}`);
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export default AdminGuard;
