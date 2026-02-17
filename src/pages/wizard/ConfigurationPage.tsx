import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SlidersHorizontal, Users, ChevronRight, Loader2 } from 'lucide-react';

import { callBookAgent, supabase } from '../../lib/api';
import type { BookContext, BookConfiguration, Chapter } from '../../types';
import { useToast } from '../../context/ToastContext';
import { getBookTypeForGenre, getPromptsForGenre, GENRE_DEFINITIONS, type BookType, type StyleFactor } from '../../data/genres';
import { getToneDescription, injectVariables } from '../../utils/prompt-engine';

const ConfigurationPage: React.FC = () => {
    const navigate = useNavigate();
    const { error } = useToast();
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Elaborazione...');

    // Context State
    const [genre, setGenre] = useState<string | null>(null);

    // Config State
    const [styleValues, setStyleValues] = useState<Record<string, number>>({});
    const [targetPages, setTargetPages] = useState(100);
    const [chaptersRate, setChaptersRate] = useState(10); // Pages per chapter default

    const [targets, setTargets] = useState<string[]>([]);
    const [availableTargets, setAvailableTargets] = useState<string[]>([]);

    const bookId = localStorage.getItem('active_book_id');

    // Fetch Book Data (Genre)
    useEffect(() => {
        if (!bookId) return;
        const fetchGenre = async () => {
            const { data } = await supabase.from('books').select('genre').eq('id', bookId).single();
            if (data?.genre) {
                setGenre(data.genre);
                // Initialize dynamic style factors
                const def = GENRE_DEFINITIONS[data.genre];
                if (def?.styleFactors) {
                    const initial: Record<string, number> = {};
                    def.styleFactors.forEach(f => {
                        initial[f.id] = f.defaultValue;
                    });
                    setStyleValues(initial);
                } else {
                    setStyleValues({
                        serious: 0.5,
                        concise: 0.5,
                        simple: 0.5
                    });
                }
            }

            const { data: bookData } = await supabase.from('books').select('context_data').eq('id', bookId).single();
            if (bookData?.context_data?.target_pages) {
                setTargetPages(parseInt(bookData.context_data.target_pages, 10));
            }
        };
        fetchGenre();
    }, [bookId]);

    // Derived Book Type
    const bookType: BookType = genre ? getBookTypeForGenre(genre) : 'FICTION';

    const genreDef = genre ? GENRE_DEFINITIONS[genre] : null;
    const currentStyleFactors: StyleFactor[] = genreDef?.styleFactors || [
        { id: 'serious', labelLow: 'Giocoso/Ironico', labelHigh: 'Serio/Accademico', defaultValue: 0.5 },
        { id: 'concise', labelLow: bookType === 'FICTION' ? 'Descrittivo' : 'Approfondito', labelHigh: bookType === 'FICTION' ? 'Conciso' : 'Sintetico', defaultValue: 0.5 },
        { id: 'simple', labelLow: bookType === 'FICTION' ? 'Complesso/Letterario' : 'Tecnico/Specialistico', labelHigh: 'Semplice/Divulgativo', defaultValue: 0.5 }
    ];

    useEffect(() => {
        if (bookType === 'FICTION') {
            setAvailableTargets(['Adolescenti', 'Giovani Adulti', 'Adulti', 'Appassionati del Genere', 'Chi cerca evasione', 'Bambini']);
            // Reset targets if switching type might be good, or keep them if they match. For simplicity, clear.
            setTargets([]);
        } else {
            setAvailableTargets(['Principianti', 'Studenti', 'Professionisti', 'Imprenditori', 'Hobbyist', 'Accademici', 'Curiosi']);
            setTargets([]);
        }
    }, [bookType]);

    const toggleTarget = (t: string) => {
        if (targets.includes(t)) {
            setTargets(targets.filter(x => x !== t));
        } else {
            setTargets([...targets, t]);
        }
    };

    const handleGenerateOutline = async () => {
        setLoading(true);
        const config: BookConfiguration = {
            ...styleValues, // Spread dynamic values
            targets,
            chaptersRate,
            book_type: bookType
        };
        let currentContext: BookContext = {};

        try {
            // Save config to Supabase first
            if (bookId) {
                const { data: currentBook } = await supabase.from('books').select('context_data').eq('id', bookId).single();
                currentContext = currentBook?.context_data || {};

                await supabase.from('books').update({
                    status: 'BLUEPRINT',
                    context_data: {
                        ...currentContext,
                        configuration: config,
                        target_pages: targetPages,
                        chapters_rate: chaptersRate
                    }
                }).eq('id', bookId);
            }

            // Prepare Dynamic Prompt
            const rawPrompts = getPromptsForGenre(genre || '');
            const toneDesc = getToneDescription(bookType, styleValues, currentStyleFactors);
            const numChapters = Math.ceil(targetPages / chaptersRate);

            // STEP 1: GENERATE PLOT SUMMARY
            setLoadingMessage('Generazione trama...');
            const plotData = await callBookAgent('GENERATE_PLOT', {
                configuration: config,
                tone: toneDesc,
                target: targets.join(", ") || "Pubblico generale",
                synopsis: currentContext.selected_concept?.description || "Sinossi non fornita"
            }, bookId);

            const plotSummary = plotData.data?.plot_summary || plotData.plot_summary || "Trama generata";

            // STEP 2: GENERATE HIERARCHICAL OUTLINE
            setLoadingMessage('Creazione indice e paragrafi...');
            const architectPrompt = injectVariables(rawPrompts?.ARCHITECT || '', {
                tone: toneDesc,
                target: targets.join(", ") || "Pubblico generale",
                synopsis: plotSummary,
                chapterCount: String(numChapters)
            });

            const data = await callBookAgent('OUTLINE', {
                configuration: { ...config, target_pages: targetPages, chapters_rate: chaptersRate },
                targetPages: targetPages,
                plotSummary: plotSummary,
                systemPrompt: architectPrompt
            }, bookId);

            const resData = data.data || data;

            // STEP 3: GENERATE PARAGRAPH DESCRIPTIONS (if missing or as part of outline)
            // For now, we assume the ARCHITECT prompt is updated to include descriptions.
            // But we'll add a step if the user specifically asked for "short description for each paragraph".

            // 2. Save transient outline and config

            // 2. Save transient outline and config
            if (resData.chapters && Array.isArray(resData.chapters)) {
                const chaptersWithIds: Chapter[] = resData.chapters.map((c: { title: string; summary?: string; scene_description?: string; paragraphs?: any[] }, i: number) => ({
                    id: `chap-${i}-${Date.now()}`,
                    title: c.title,
                    summary: c.summary || c.scene_description || '',
                    scene_description: c.scene_description,
                    paragraphs: c.paragraphs || [],
                    status: 'pending'
                }));
                localStorage.setItem('project_chapters', JSON.stringify(chaptersWithIds));
                localStorage.setItem('project_plot_summary', plotSummary);
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
                    Definisci il tono di voce e il pubblico ideale per il tuo {genre || 'libro'}.
                </p>
            </header>

            <div className="glass-panel" style={{ padding: '3rem' }}>

                {/* Tone Sliders */}
                <section style={{ marginBottom: '4rem' }}>
                    <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SlidersHorizontal size={20} color="var(--accent)" /> Tono e Stile
                    </h3>

                    <div style={{ display: 'grid', gap: '2.5rem' }}>
                        {currentStyleFactors.map(factor => (
                            <div className="slider-group" key={factor.id}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                    <span>{factor.labelLow}</span>
                                    <span>{factor.labelHigh}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.1"
                                    value={styleValues[factor.id] ?? factor.defaultValue}
                                    onChange={(e) => setStyleValues(prev => ({ ...prev, [factor.id]: parseFloat(e.target.value) }))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                <section style={{ marginBottom: '4rem' }}>
                    <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SlidersHorizontal size={20} color="var(--accent)" /> Struttura e Volume
                    </h3>

                    <div style={{ display: 'grid', gap: '2.5rem' }}>
                        <div className="slider-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                <span>Lunghezza Target</span>
                                <span>{targetPages} pagine</span>
                            </div>
                            <input
                                type="range"
                                min="50" max="500" step="10"
                                value={targetPages}
                                onChange={(e) => setTargetPages(parseInt(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div className="slider-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                <span>Densità Capitoli (1 cap ogni {chaptersRate} pag.)</span>
                                <span>{chaptersRate} pagine</span>
                            </div>
                            <input
                                type="range"
                                min="5" max="30" step="1"
                                value={chaptersRate}
                                onChange={(e) => setChaptersRate(parseInt(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '1.5rem',
                            borderRadius: '12px',
                            border: '1px solid var(--glass-border)',
                            textAlign: 'center'
                        }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Configurazione Calcolata</p>
                            <h4 style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                                {Math.ceil(targetPages / chaptersRate)} Capitoli stimati
                            </h4>
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
                        {loading ? <><Loader2 className="animate-spin" /> {loadingMessage}</> : <>Genera Architettura <ChevronRight size={18} /></>}
                    </button>
                </div>

            </div >
        </div >
    );
};

export default ConfigurationPage;
