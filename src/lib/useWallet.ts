import { useState, useEffect } from 'react';
import { supabase } from './api';
import { useAuth } from './auth';

export interface UserWallet {
    id: string;
    user_id: string;
    balance: number;
    updated_at: string;
}

export function useWallet() {
    const { user } = useAuth();
    const [wallet, setWallet] = useState<UserWallet | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            fetchWallet();
        } else {
            setWallet(null);
            setLoading(false);
        }
    }, [user]);

    const fetchWallet = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error: err } = await supabase
                .from('user_wallets')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (err && err.code !== 'PGRST116') { // PGRST116 is "No rows found"
                throw err;
            }

            if (!data) {
                // Create an empty wallet for the user if it doesn't exist
                const { data: newWallet, error: createErr } = await supabase
                    .from('user_wallets')
                    .insert({ user_id: user.id, balance: 0 })
                    .select()
                    .single();

                if (createErr) throw createErr;
                setWallet(newWallet);
            } else {
                setWallet(data);
            }

        } catch (err: any) {
            console.error('Error fetching wallet:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getBalance = () => {
        return wallet?.balance || 0;
    };

    const hasEnoughCredit = (cost: number) => {
        return getBalance() >= cost;
    };

    return {
        wallet,
        loading,
        error,
        refreshWallet: fetchWallet,
        getBalance,
        hasEnoughCredit
    };
}
