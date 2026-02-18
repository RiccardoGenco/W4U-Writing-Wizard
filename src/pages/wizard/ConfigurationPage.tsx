import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SlidersHorizontal, Users, ChevronRight, Loader2 } from 'lucide-react';

import { callBookAgent, supabase, logDebug } from '../../lib/api';
import type { BookContext, BookConfiguration, Chapter } from '../../types';
import { useToast } from '../../context/ToastContext';

const ConfigurationPage: React.FC = () => {
    const navigate = useNavigate();
    const { error } = useToast();
    const [loading, setLoading] = useState(false);

    // State
    const [toneSerious, setToneSerious] = useState(0.5); // 0 = Playful, 1 = Serious
    const [toneConcise, setToneConcise] = useState(0.5); // 0 = Verbose, 1 = Concise
    const [toneSimple, setToneSimple] = useState(0.5);   // 0 = Complex, 1 = Simple
    const [chaptersRate, setChaptersRate] = useState(10); // Pages per chapter default

    const [targets, setTargets] = useState<string[]>([]);

    const availableTargets = ['Principianti', 'Appassionati', 'Professionisti', 'Studenti', 'Curiosi', 'Bambini'];

    const toggleTarget = (t: string) => {
        if (targets.includes(t)) {
            setTargets(targets.filter(x => x !== t));
        } else {
            setTargets([...targets, t]);
        }
    };

    const handleGenerateOutline = async () => {
        setLoading(true);
        const config: BookConfiguration = { toneSerious, toneConcise, toneSimple, targets, chaptersRate };
        const bookId = localStorage.getItem('active_book_id');
        let currentContext: BookContext = {};

        try {
            // Fetch current context first
            if (bookId) {
                const { data: currentBook } = await supabase.from('books').select('context_data').eq('id', bookId).single();
                currentContext = currentBook?.context_data || {};
            }

            // 1. Call n8n to generate outline
            const targetPages = parseInt(currentContext.target_pages as any) || 100;
            const numChapters = Math.max(1, Math.floor(targetPages / chaptersRate));

            // Save config to Supabase
            if (bookId) {
                await supabase.from('books').update({
                    status: 'BLUEPRINT',
                    target_chapters: numChapters,
                    context_data: { ...currentContext, configuration: config }
                }).eq('id', bookId);
            }

            const data = await callBookAgent('OUTLINE', {
                configuration: config,
                targetPages: targetPages,
                numChapters: numChapters
            }, bookId);

            const resData = data.data || data;

            // Validation: check if AI generated the expected number of chapters
            if (resData.chapters && Array.isArray(resData.chapters) && resData.chapters.length !== numChapters) {
                console.warn(`[ARCHITECT] Mismatch: Expected ${numChapters}, got ${resData.chapters.length}`);
                await logDebug('frontend', 'chapter_count_mismatch', {
                    expected: numChapters,
                    actual: resData.chapters.length,
                    book_id: bookId
                }, bookId);
            }

            // 2. Save transient outline and config
            if (resData.chapters && Array.isArray(resData.chapters)) {
                const chaptersWithIds: Chapter[] = resData.chapters.map((c: { title: string; summary?: string; scene_description?: string }, i: number) => ({
                    id: `chap-${i}-${Date.now()}`,
                    title: c.title,
                    summary: c.summary || c.scene_description || '',
                    scene_description: c.scene_description,
                    status: 'pending'
                }));
                localStorage.setItem('project_chapters', JSON.stringify(chaptersWithIds));
                navigate('/create/blueprint');
            } else {
                throw new Error("Invalid outline format received");
            }

        } catch (err) {
            console.error(err);
            error("Errore generazione indice. Riprova.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ paddingTop: '2rem' }}>
            {/* Stepper (Simplified) */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem', justifyContent: 'center' }}>
                <div style={{ height: '4px', width: '40px', background: 'var(--success)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--primary)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
                <div style={{ height: '4px', width: '40px', background: 'var(--glass-border)', borderRadius: '2px' }}></div>
            </div>

            <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Metti a punto lo stile</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                    Definisci il tono di voce e il pubblico ideale per il tuo libro.
                </p>
            </header>

            <div className="glass-panel" style={{ padding: '3rem' }}>

                {/* Tone Sliders */}
                <section style={{ marginBottom: '4rem' }}>
                    <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SlidersHorizontal size={20} color="var(--accent)" /> Tono di Voce
                    </h3>

                    <div style={{ display: 'grid', gap: '2.5rem' }}>
                        <div className="slider-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                <span>Giocoso/Ironico</span>
                                <span>Serio/Accademico</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={toneSerious}
                                onChange={(e) => setToneSerious(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div className="slider-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                <span>Narrativo/Descrittivo</span>
                                <span>Conciso/Pratico</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={toneConcise}
                                onChange={(e) => setToneConcise(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div className="slider-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                <span>Tecnico/Complesso</span>
                                <span>Semplice/Divulgativo</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={toneSimple}
                                onChange={(e) => setToneSimple(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>
                </section>



                {/* Structure Settings */}
                <section style={{ marginBottom: '4rem' }}>
                    <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SlidersHorizontal size={20} color="var(--accent)" /> Struttura
                    </h3>

                    <div className="slider-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            <span>Densità Capitoli (1 cap. ogni {chaptersRate} pag.)</span>
                            <span>{chaptersRate} pagine</span>
                        </div>
                        <input
                            type="range"
                            min="10" max="20" step="1"
                            value={chaptersRate}
                            onChange={(e) => setChaptersRate(parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>Frequente (Brevi)</span>
                            <span>Rado (Lunghi)</span>
                        </div>
                    </div>
                </section>

                {/* Target Chips */}
                <section style={{ marginBottom: '3rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={20} color="var(--accent)" /> Target Audience
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        {availableTargets.map(t => (
                            <motion.button
                                key={t}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => toggleTarget(t)}
                                style={{
                                    background: targets.includes(t) ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                    border: targets.includes(t) ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '50px',
                                    color: targets.includes(t) ? 'white' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                {t}
                            </motion.button>
                        ))}
                    </div>
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn-primary"
                        onClick={handleGenerateOutline}
                        disabled={loading}
                        style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                    >
                        {loading ? <><Loader2 className="animate-spin" /> Elaborazione...</> : <>Genera Architettura <ChevronRight size={18} /></>}
                    </button>
                </div>

            </div >
        </div >
    );
};

export default ConfigurationPage;
