import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Check, X, ChevronRight, FileEdit } from 'lucide-react';

const EditorPage: React.FC = () => {
    const navigate = useNavigate();
    const [selectedChapter, setSelectedChapter] = useState(0);
    const [optimizing, setOptimizing] = useState(false);
    const [suggestion, setSuggestion] = useState<string | null>(null);

    // Mock data
    const chapters = [
        { title: 'Capitolo 1: L\'Inizio', content: 'C\'era una volta...' },
        { title: 'Capitolo 2: Lo Svolgimento', content: 'E poi accadde che...' },
    ];

    const optimize = () => {
        setOptimizing(true);
        setTimeout(() => {
            setOptimizing(false);
            setSuggestion('Ho notato che il tono qui è troppo tecnico rispetto ai capitoli precedenti. Vuoi renderlo più discorsivo?');
        }, 1500);
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 300px', gap: '1rem', height: '100%' }}>
            {/* Left: Chapter Nav */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Capitoli</h3>
                {chapters.map((c, i) => (
                    <div
                        key={i}
                        onClick={() => setSelectedChapter(i)}
                        style={{
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: selectedChapter === i ? 'var(--primary)' : 'transparent',
                            cursor: 'pointer',
                            marginBottom: '0.5rem',
                            fontSize: '0.9rem'
                        }}
                    >
                        {c.title}
                    </div>
                ))}
            </div>

            {/* Center: Content */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <h2>{chapters[selectedChapter].title}</h2>
                    <button onClick={optimize} className="btn-secondary" disabled={optimizing}>
                        <Wand2 size={16} style={{ marginRight: '5px' }} />
                        {optimizing ? 'Analisi...' : 'Ottimizza'}
                    </button>
                </header>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', color: '#cbd5e1' }}>
                    {chapters[selectedChapter].content}
                    <p>Lorem ipsum dolor sit amet...</p>
                </div>
            </div>

            {/* Right: AI Editor */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
                    <FileEdit size={20} /> <span style={{ fontWeight: 600 }}>Agente Editor</span>
                </div>

                {suggestion ? (
                    <div className="fade-in" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--accent)' }}>
                        <p style={{ fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                            "{suggestion}"
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-primary" style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }} onClick={() => setSuggestion(null)}>
                                <Check size={14} /> Applica
                            </button>
                            <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }} onClick={() => setSuggestion(null)}>
                                <X size={14} /> Ignora
                            </button>
                        </div>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                        Seleziona un capitolo e clicca "Ottimizza" per ricevere suggerimenti.
                    </p>
                )}

                <div style={{ marginTop: 'auto' }}>
                    <button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/create/export')}>
                        Vai all'Export <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditorPage;
