import React, { useState, useEffect } from 'react';
import { Shield, Users, BookOpen, Coins, Loader2, ChevronDown, ChevronUp, FileText, Save, RefreshCw, AlertCircle, Tag, Sparkles } from 'lucide-react';
import { supabase } from '../lib/api';
import PromoCodesAdmin from '../components/PromoCodesAdmin';

interface UserCostStat {
    user_id: string;
    user_email?: string;
    author_name?: string;
    total_books_generated: number;
    total_requests: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_estimated_cost_eur: number;
}

interface BookCostStat {
    book_id: string;
    title: string;
    user_id: string;
    user_email?: string;
    author_name?: string;
    total_requests: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_estimated_cost_eur: number;
}

interface SystemPrompt {
    key: string;
    prompt_text: string;
    description: string;
    updated_at: string;
}

interface AIPrompt {
    id: string;
    name: string;
    book_type: string;
    genre: string;
    prompt_text: string;
    description: string;
    is_active: boolean;
    created_at: string;
}

const AdminDashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [userStats, setUserStats] = useState<UserCostStat[]>([]);
    const [bookStats, setBookStats] = useState<BookCostStat[]>([]);
    const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
    const [aiPrompts, setAiPrompts] = useState<AIPrompt[]>([]);
    const [isUserTableOpen, setIsUserTableOpen] = useState(true);
    const [isBookTableOpen, setIsBookTableOpen] = useState(true);
    const [isCourtesyPagesOpen, setIsCourtesyPagesOpen] = useState(false);
    const [isAIPromptsOpen, setIsAIPromptsOpen] = useState(false);
    const [isPricingOpen, setIsPricingOpen] = useState(false);
    const [isPromoCodesOpen, setIsPromoCodesOpen] = useState(false);
    const [savingPrompt, setSavingPrompt] = useState<string | null>(null);
    const [savingAIPrompt, setSavingAIPrompt] = useState<string | null>(null);
    const [pricingConfig, setPricingConfig] = useState<any>(null);
    const [savingPricing, setSavingPricing] = useState(false);

    useEffect(() => {
        fetchAdminData();
    }, []);

    const fetchAdminData = async () => {
        setLoading(true);
        try {
            const [userRes, bookRes, promptRes, pricingRes, aiPromptRes] = await Promise.all([
                supabase.from('vw_cost_per_user').select('*').order('total_estimated_cost_eur', { ascending: false }),
                supabase.from('vw_cost_per_book').select('*').order('total_estimated_cost_eur', { ascending: false }),
                supabase.from('system_prompts').select('*').filter('key', 'ilike', 'courtesy_%').order('key'),
                supabase.from('pricing_config').select('*').limit(1).single(),
                supabase.from('ai_prompts').select('*').order('genre').order('name')
            ]);

            if (userRes.error) throw userRes.error;
            if (bookRes.error) throw bookRes.error;
            if (promptRes.error) throw promptRes.error;
            if (pricingRes.error && pricingRes.error.code !== 'PGRST116') throw pricingRes.error;
            if (aiPromptRes.error) throw aiPromptRes.error;

            setUserStats(userRes.data || []);
            setBookStats(bookRes.data || []);
            setSystemPrompts(promptRes.data || []);
            setPricingConfig(pricingRes.data || null);
            setAiPrompts(aiPromptRes.data || []);
        } catch (err) {
            console.error("Error fetching admin stats:", err);
            // In a real app, use the Toast component here
            alert("Errore nel caricamento dei dati di amministrazione.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePricing = async () => {
        if (!pricingConfig || !pricingConfig.id) return;
        setSavingPricing(true);
        try {
            const payload = {
                base_price_eur: Number(pricingConfig.base_price_eur),
                base_pages: Number(pricingConfig.base_pages),
                extra_price_eur: Number(pricingConfig.extra_price_eur),
                extra_pages_increment: Number(pricingConfig.extra_pages_increment),
                max_pages: Number(pricingConfig.max_pages),
                updated_at: new Date().toISOString()
            };
            const { error } = await supabase
                .from('pricing_config')
                .update(payload)
                .eq('id', pricingConfig.id);

            if (error) throw error;
            // set saved successfully (maybe use a toast in real app)
        } catch (err: any) {
            console.error("Error updating pricing:", err);
            alert(`Errore nell'aggiornamento dei prezzi: ${err.message || JSON.stringify(err)}`);
        } finally {
            setSavingPricing(false);
        }
    };

    const handleUpdatePrompt = async (key: string, newText: string) => {
        setSavingPrompt(key);
        try {
            const { error } = await supabase
                .from('system_prompts')
                .update({ prompt_text: newText, updated_at: new Date().toISOString() })
                .eq('key', key);

            if (error) throw error;

            setSystemPrompts(prev => prev.map(p => p.key === key ? { ...p, prompt_text: newText } : p));
            // alert("Template aggiornato con successo!");
        } catch (err) {
            console.error("Error updating prompt:", err);
            alert("Errore nell'aggiornamento del template.");
        } finally {
            setSavingPrompt(null);
        }
    };

    const handleUpdateAIPrompt = async (id: string, newText: string) => {
        setSavingAIPrompt(id);
        try {
            const { error } = await supabase
                .from('ai_prompts')
                .update({ prompt_text: newText })
                .eq('id', id);

            if (error) throw error;

            setAiPrompts(prev => prev.map(p => p.id === id ? { ...p, prompt_text: newText } : p));
        } catch (err) {
            console.error("Error updating AI prompt:", err);
            alert("Errore nell'aggiornamento del prompt AI.");
        } finally {
            setSavingAIPrompt(null);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 }).format(value);
    };

    const formatNumber = (value: number) => {
        return new Intl.NumberFormat('it-IT').format(value);
    };

    // Calculate Totals
    const totalSystemCost = userStats.reduce((acc, curr) => acc + Number(curr.total_estimated_cost_eur), 0);
    const totalSystemTokens = userStats.reduce((acc, curr) => acc + Number(curr.total_tokens), 0);
    const totalSystemBooks = bookStats.length;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" />
            </div>
        );
    }

    return (
        <div className="container-narrow fade-in" style={{ padding: '2rem 4rem', maxWidth: '1200px', margin: '0 auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
                <div style={{ background: 'rgba(251, 113, 133, 0.1)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(251, 113, 133, 0.2)' }}>
                    <Shield size={32} color="var(--error)" />
                </div>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.2rem' }}>Pannello Amministratore</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Monitoraggio Costi AI e Utilizzo Sistema</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(0, 242, 255, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <Coins size={24} color="var(--primary)" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Costo Totale Sistema</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatCurrency(totalSystemCost)}</h3>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <BookOpen size={24} color="#a855f7" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Libri Totali DB</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatNumber(totalSystemBooks)}</h3>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <Users size={24} color="#22c55e" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Token Rete Generati</p>
                        <h3 style={{ fontSize: '1.8rem' }}>{formatNumber(totalSystemTokens)}</h3>
                    </div>
                </div>
            </div>

            {/* User Costs Table */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', overflowX: 'auto', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isUserTableOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsUserTableOpen(!isUserTableOpen)}
                >
                    <Users size={20} color="var(--primary)" /> Costi per Utente Registrato
                    {isUserTableOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isUserTableOpen && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <th style={{ padding: '1rem 0.5rem' }}>Utente</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Libri Creazione</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Chiamate API</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Token Consumati</th>
                                <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Costo Stimato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {userStats.length > 0 ? userStats.map((stat, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <strong>{stat.author_name || stat.user_email || 'Utente Sconosciuto'}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{stat.user_id?.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_books_generated}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_requests}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{formatNumber(stat.total_tokens)}</td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(stat.total_estimated_cost_eur)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nessun dato disponibile</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pricing Management */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isPricingOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsPricingOpen(!isPricingOpen)}
                >
                    <Coins size={20} color="var(--primary)" /> Gestione Prezzi
                    {isPricingOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isPricingOpen && pricingConfig && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Costo Base (€)</label>
                                <input
                                    type="number"
                                    value={pricingConfig.base_price_eur}
                                    onChange={(e) => setPricingConfig({ ...pricingConfig, base_price_eur: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pagine Incluse Base</label>
                                <input
                                    type="number"
                                    value={pricingConfig.base_pages}
                                    onChange={(e) => setPricingConfig({ ...pricingConfig, base_pages: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Costo Scatto Extra (€)</label>
                                <input
                                    type="number"
                                    value={pricingConfig.extra_price_eur}
                                    onChange={(e) => setPricingConfig({ ...pricingConfig, extra_price_eur: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pagine per Scatto Extra</label>
                                <input
                                    type="number"
                                    value={pricingConfig.extra_pages_increment}
                                    onChange={(e) => setPricingConfig({ ...pricingConfig, extra_pages_increment: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Limite Massimo Pagine</label>
                                <input
                                    type="number"
                                    value={pricingConfig.max_pages}
                                    onChange={(e) => setPricingConfig({ ...pricingConfig, max_pages: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleUpdatePricing}
                                disabled={savingPricing}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem' }}
                            >
                                {savingPricing ? <><RefreshCw size={18} className="animate-spin" /> Salvataggio...</> : <><Save size={18} /> Salva Configurazione</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Promo Codes Management */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isPromoCodesOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsPromoCodesOpen(!isPromoCodesOpen)}
                >
                    <Tag size={20} color="var(--primary)" /> Gestione Codici Promozionali
                    {isPromoCodesOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isPromoCodesOpen && (
                    <PromoCodesAdmin />
                )}
            </div>

            {/* AI Prompts Management */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isAIPromptsOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsAIPromptsOpen(!isAIPromptsOpen)}
                >
                    <Sparkles size={20} color="var(--primary)" /> Gestione Prompt Generativi (AI)
                    {isAIPromptsOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isAIPromptsOpen && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.1)', display: 'flex', gap: '1rem' }}>
                            <AlertCircle size={20} color="#a855f7" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 600 }}>Personalizzazione Prompt per Genere:</p>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Qui puoi definire come l'IA deve scrivere per ogni specifico genere. <br />
                                    I prompt <strong>GENERAL</strong> sono usati come base se non esiste un prompt specifico per il genere del libro.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {aiPrompts.map((prompt) => (
                                <div key={prompt.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                            <div style={{
                                                background: prompt.genre === 'GENERAL' ? 'rgba(255,255,255,0.1)' : 'rgba(0, 242, 255, 0.1)',
                                                padding: '0.3rem 0.8rem',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                border: prompt.genre === 'GENERAL' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0, 242, 255, 0.3)',
                                                color: prompt.genre === 'GENERAL' ? '#fff' : 'var(--primary)'
                                            }}>
                                                {prompt.genre}
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>
                                                    {prompt.name} ({prompt.book_type})
                                                </h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{prompt.description}</p>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Creato il: {new Date(prompt.created_at).toLocaleDateString('it-IT')}
                                        </div>
                                    </div>

                                    <textarea
                                        defaultValue={prompt.prompt_text}
                                        onBlur={(e) => {
                                            if (e.target.value !== prompt.prompt_text) {
                                                handleUpdateAIPrompt(prompt.id, e.target.value);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            minHeight: '150px',
                                            background: 'rgba(0,0,0,0.3)',
                                            color: '#e2e8f0',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '8px',
                                            padding: '1rem',
                                            fontFamily: 'monospace',
                                            fontSize: '0.9rem',
                                            resize: 'vertical',
                                            outline: 'none',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {savingAIPrompt === prompt.id ? (
                                                <>
                                                    <RefreshCw size={14} className="animate-spin" /> Salvataggio...
                                                </>
                                            ) : (
                                                <>
                                                    <Save size={14} /> Modifiche salvate al click fuori
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Courtesy Pages Management */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isCourtesyPagesOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsCourtesyPagesOpen(!isCourtesyPagesOpen)}
                >
                    <FileText size={20} color="var(--primary)" /> Gestione Pagine di Cortesia
                    {isCourtesyPagesOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isCourtesyPagesOpen && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0, 242, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 242, 255, 0.1)', display: 'flex', gap: '1rem' }}>
                            <AlertCircle size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 600 }}>Istruzioni Segnaposti:</p>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Puoi usare i seguenti segnaposti nei template: <br />
                                    <code>{`{{title}}`}</code> per il titolo, <code>{`{{author}}`}</code> per l'autore, <code>{`{{description}}`}</code> per la trama lunga, <code>{`{{description_short}}`}</code> per i primi 50 caratteri, <code>{`{{disclaimer}}`}</code> per il testo legale.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {systemPrompts.map((prompt) => (
                                <div key={prompt.key} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{prompt.key.replace('courtesy_', '').replace(/_/g, ' ').toUpperCase()}</h3>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{prompt.description}</p>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Ultimo aggiornamento: {new Date(prompt.updated_at).toLocaleString('it-IT')}
                                        </div>
                                    </div>

                                    <textarea
                                        defaultValue={prompt.prompt_text}
                                        onBlur={(e) => {
                                            if (e.target.value !== prompt.prompt_text) {
                                                handleUpdatePrompt(prompt.key, e.target.value);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            minHeight: prompt.key === 'courtesy_disclaimer' ? '120px' : '200px',
                                            background: 'rgba(0,0,0,0.3)',
                                            color: '#e2e8f0',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '8px',
                                            padding: '1rem',
                                            fontFamily: 'monospace',
                                            fontSize: '0.9rem',
                                            resize: 'vertical',
                                            outline: 'none',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {savingPrompt === prompt.key ? (
                                                <>
                                                    <RefreshCw size={14} className="animate-spin" /> Salvataggio...
                                                </>
                                            ) : (
                                                <>
                                                    <Save size={14} /> Modifiche salvate al click fuori dal campo
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Book Costs Table */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '4rem', overflowX: 'auto', transition: 'all 0.3s ease' }}>
                <h2
                    style={{ marginBottom: isBookTableOpen ? '1.5rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setIsBookTableOpen(!isBookTableOpen)}
                >
                    <BookOpen size={20} color="#a855f7" /> Dettaglio Costi per Libro Singolo
                    {isBookTableOpen ? <ChevronUp size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </h2>

                {isBookTableOpen && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <th style={{ padding: '1rem 0.5rem' }}>Titolo (ID)</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Utente Proprietario</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Chiamate API</th>
                                <th style={{ padding: '1rem 0.5rem' }}>Token Consumati</th>
                                <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Costo Stimato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookStats.length > 0 ? bookStats.map((stat, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <strong>{stat.title || 'Senza Titolo'}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{stat.book_id.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        {stat.author_name || stat.user_email || (stat.user_id ? stat.user_id.substring(0, 8) + '...' : 'N/A')}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{stat.total_requests}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{formatNumber(stat.total_tokens)}</td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(stat.total_estimated_cost_eur)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nessun dato disponibile</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

        </div>
    );
};

export default AdminDashboard;
