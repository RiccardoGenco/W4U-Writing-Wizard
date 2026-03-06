import { useState, useEffect } from 'react';
import { supabase } from './api';

export interface PricingConfig {
    base_price_eur: number;
    base_pages: number;
    extra_price_eur: number;
    extra_pages_increment: number;
    max_pages: number;
}

export function usePricing() {
    const [config, setConfig] = useState<PricingConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPricingConfig();
    }, []);

    const fetchPricingConfig = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('pricing_config')
                .select('*')
                .limit(1)
                .single();

            if (error) throw error;
            if (data) {
                setConfig(data);
            }
        } catch (err: any) {
            console.error('Error fetching pricing config:', err);
            setError('Impossibile caricare le configurazioni di prezzo.');
        } finally {
            setLoading(false);
        }
    };

    const calculateTotal = (pages: number) => {
        if (!config) return 0;
        const extraPages = Math.max(0, pages - config.base_pages);
        const increments = Math.ceil(extraPages / config.extra_pages_increment);
        return config.base_price_eur + (increments * config.extra_price_eur);
    };

    return {
        config,
        loading,
        error,
        calculateTotal,
        refreshConfig: fetchPricingConfig
    };
}
