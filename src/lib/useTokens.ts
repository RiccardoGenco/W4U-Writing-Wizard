import { useState, useEffect } from 'react';
import { supabase } from './api';
import { useAuth } from './auth';

export interface UserToken {
    id: string;
    user_id: string;
    checkout_session_id: string;
    target_pages: number;
    is_used: boolean;
    used_at: string | null;
    created_at: string;
}

export function useTokens() {
    const { user } = useAuth();
    const [tokens, setTokens] = useState<UserToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            fetchTokens();
        } else {
            setTokens([]);
            setLoading(false);
        }
    }, [user]);

    const fetchTokens = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error: err } = await supabase
                .from('user_book_tokens')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (err) throw err;
            setTokens(data || []);
        } catch (err: any) {
            console.error('Error fetching tokens:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getAvailableGenerations = () => {
        return tokens.filter(t => !t.is_used);
    };

    const hasTokens = () => {
        return getAvailableGenerations().length > 0;
    };

    return {
        tokens,
        loading,
        error,
        refreshTokens: fetchTokens,
        getAvailableGenerations,
        hasTokens
    };
}
