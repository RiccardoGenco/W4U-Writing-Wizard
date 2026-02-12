import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'w4u-theme';

function getSystemTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored || getSystemTheme();
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    // Apply theme to <html> element
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    // Listen for system theme changes (only when no manual preference)
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const handler = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setThemeState(e.matches ? 'light' : 'dark');
            }
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    return { theme, toggleTheme, isDark: theme === 'dark' };
}
