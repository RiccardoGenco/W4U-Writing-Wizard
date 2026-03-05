import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/api';
import { Plus, Loader2, Save, Trash2, CheckCircle, XCircle, Users } from 'lucide-react';

export interface PromoCode {
    id: string;
    code: string;
    discount_rate: number;
    max_uses: number | null;
    current_uses: number;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
}

interface Redemption {
    id: string;
    redeemed_at: string;
    users: any;
}

const PromoCodesAdmin: React.FC = () => {
    const [codes, setCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [newCode, setNewCode] = useState('');
    const [discountRate, setDiscountRate] = useState<number>(20);
    const [maxUses, setMaxUses] = useState<number | ''>('');
    const [expiresAt, setExpiresAt] = useState('');
    const [saving, setSaving] = useState(false);

    // Redemptions state
    const [viewingCode, setViewingCode] = useState<PromoCode | null>(null);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [loadingRedemptions, setLoadingRedemptions] = useState(false);

    useEffect(() => {
        fetchCodes();
    }, []);

    const fetchCodes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('promo_codes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCodes(data || []);
        } catch (err: any) {
            console.error('Error fetching promo codes:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                code: newCode.toUpperCase(),
                discount_rate: discountRate,
                max_uses: maxUses === '' ? null : Number(maxUses),
                expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
                is_active: true
            };

            const { data, error } = await supabase
                .from('promo_codes')
                .insert([payload])
                .select()
                .single();

            if (error) throw error;

            setCodes([data, ...codes]);
            setShowForm(false);

            // Reset form
            setNewCode('');
            setDiscountRate(20);
            setMaxUses('');
            setExpiresAt('');
        } catch (err: any) {
            console.error("Error creating promo code:", err);
            alert("Errore nella creazione del codice promozionale. Assicurati che non esista già.");
        } finally {
            setSaving(false);
        }
    };

    const toggleActiveStatus = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('promo_codes')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            setCodes(codes.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
        } catch (err: any) {
            console.error('Error toggling status:', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Sei sicuro di voler eliminare questo codice? Verrà eliminato anche lo storico utilizzi.")) return;

        try {
            const { error } = await supabase
                .from('promo_codes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setCodes(codes.filter(c => c.id !== id));
        } catch (err: any) {
            console.error('Error deleting code:', err);
            alert("Impossibile eliminare il codice. Si è verificato un errore.");
        }
    };

    const fetchRedemptions = async (code: PromoCode) => {
        setViewingCode(code);
        setLoadingRedemptions(true);
        try {
            const { data, error } = await supabase
                .from('promo_code_redemptions')
                .select('id, redeemed_at, users:user_id(email)')
                .eq('promo_code_id', code.id)
                .order('redeemed_at', { ascending: false });

            if (error) throw error;
            setRedemptions(data || []);
        } catch (err: any) {
            console.error('Error fetching redemptions:', err);
        } finally {
            setLoadingRedemptions(false);
        }
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>Crea e gestisci i codici sconto per gli utenti.</p>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="btn-primary"
                    style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                >
                    {showForm ? 'Annulla' : <><Plus size={16} /> Nuovo Codice</>}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleCreateCode} style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Aggiungi Nuovo Codice</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Codice (es. SUMMER20)</label>
                            <input
                                required
                                type="text"
                                placeholder="PROMO2026"
                                value={newCode}
                                onChange={(e) => setNewCode(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', textTransform: 'uppercase' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sconto in %</label>
                            <input
                                required
                                type="number"
                                min="1"
                                max="100"
                                value={discountRate}
                                onChange={(e) => setDiscountRate(Number(e.target.value))}
                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Scadenza (Opzionale)</label>
                            <input
                                type="date"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Usi max. (Opzionale)</label>
                            <input
                                type="number"
                                min="1"
                                placeholder="Senza limite"
                                value={maxUses}
                                onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : '')}
                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" disabled={saving || !newCode} className="btn-primary" style={{ padding: '0.8rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva Codice
                        </button>
                    </div>
                </form>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <th style={{ padding: '1rem 0.5rem' }}>Codice</th>
                            <th style={{ padding: '1rem 0.5rem' }}>Sconto</th>
                            <th style={{ padding: '1rem 0.5rem' }}>Utilizzi</th>
                            <th style={{ padding: '1rem 0.5rem' }}>Scadenza</th>
                            <th style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>Stato</th>
                            <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {codes.length > 0 ? codes.map((code, i) => {
                            const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                            const isExhausted = code.max_uses !== null && code.current_uses >= code.max_uses!;

                            return (
                                <tr key={code.id} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent', opacity: (isExpired || isExhausted || !code.is_active) ? 0.6 : 1 }}>
                                    <td style={{ padding: '1rem 0.5rem', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                                        {code.code}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <span style={{ background: 'rgba(0, 242, 255, 0.1)', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {code.discount_rate}%
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', fontSize: '0.9rem' }}>
                                        {code.current_uses} / {code.max_uses || "∞"}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', fontSize: '0.9rem', color: isExpired ? 'var(--error)' : 'inherit' }}>
                                        {code.expires_at ? new Date(code.expires_at).toLocaleDateString('it-IT') : "Nessuna"}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => toggleActiveStatus(code.id, code.is_active)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: code.is_active ? '#22c55e' : 'var(--text-muted)'
                                            }}
                                            title={code.is_active ? "Disattiva" : "Attiva"}
                                        >
                                            {code.is_active ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                        </button>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => fetchRedemptions(code)}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0.5rem', opacity: 0.8 }}
                                            className="hover:opacity-100 transition-opacity"
                                            title="Chi l'ha usato?"
                                        >
                                            <Users size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(code.id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0.5rem', opacity: 0.7 }}
                                            className="hover:opacity-100 transition-opacity"
                                            title="Elimina"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nessun codice promozionale creato</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Redemptions Modal Overlay */}
            {viewingCode && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--glass-border)', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem' }}>Usi Codice: <span style={{ color: 'var(--primary)' }}>{viewingCode.code}</span></h2>
                            <button onClick={() => setViewingCode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>

                        {loadingRedemptions ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>
                        ) : redemptions.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        <th style={{ padding: '0.8rem 0.5rem' }}>Data Riscattato</th>
                                        <th style={{ padding: '0.8rem 0.5rem' }}>Email Utente</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {redemptions.map((r, i) => (
                                        <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent' }}>
                                            <td style={{ padding: '1rem 0.5rem', fontSize: '0.9rem' }}>
                                                {new Date(r.redeemed_at).toLocaleString('it-IT')}
                                            </td>
                                            <td style={{ padding: '1rem 0.5rem', fontFamily: 'monospace' }}>
                                                {Array.isArray(r.users) ? r.users[0]?.email : r.users?.email || 'Utente rimosso'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Questo codice non è ancora stato utilizzato da nessuno.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromoCodesAdmin;
