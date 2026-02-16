import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    onClose: (id: string) => void;
}

const icons = {
    success: <CheckCircle size={20} className="text-green-400" />,
    error: <AlertCircle size={20} className="text-red-400" />,
    warning: <AlertTriangle size={20} className="text-yellow-400" />,
    info: <Info size={20} className="text-blue-400" />
};

const bgColors = {
    success: 'rgba(22, 101, 52, 0.9)', // green-900/90
    error: 'rgba(127, 29, 29, 0.9)',   // red-900/90
    warning: 'rgba(113, 63, 18, 0.9)', // yellow-900/90
    info: 'rgba(30, 58, 138, 0.9)'     // blue-900/90
};

const borderColors = {
    success: 'rgba(34, 197, 94, 0.3)',
    error: 'rgba(239, 68, 68, 0.3)',
    warning: 'rgba(234, 179, 8, 0.3)',
    info: 'rgba(59, 130, 246, 0.3)'
};

export const Toast: React.FC<ToastProps> = ({ id, message, type, duration = 5000, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, onClose]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                background: bgColors[type],
                border: `1px solid ${borderColors[type]}`,
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(8px)',
                minWidth: '300px',
                maxWidth: '400px',
                pointerEvents: 'auto'
            }}
        >
            <div style={{ flexShrink: 0 }}>{icons[type]}</div>
            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.4, flexGrow: 1 }}>{message}</p>
            <button
                onClick={() => onClose(id)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    transition: 'background 0.2s'
                }}
            >
                <X size={16} />
            </button>
        </motion.div>
    );
};
