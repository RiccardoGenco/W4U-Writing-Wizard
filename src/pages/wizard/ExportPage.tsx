import React, { useState } from 'react';
import { Download, FileText, Smartphone, Image, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/api';

const ExportPage: React.FC = () => {
    const [exporting, setExporting] = useState(false);
    const [finished, setFinished] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");

    const handleExport = async () => {
        if (!selectedFormat) return;

        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) {
            alert("Errore: ID libro non trovato.");
            return;
        }

        setExporting(true);
        try {
            if (selectedFormat === 'PDF') {
                setProgress("Il server sta impaginando il tuo libro (Richiede circa 10-30 secondi)...");

                // Get current session for Edge Function authentication
                const { data: { session } } = await supabase.auth.getSession();

                const response = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({ bookId })
                    }
                );

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: "Errore sconosciuto" }));
                    throw new Error(error.error || "Errore durante la generazione del PDF professional");
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `libro_${bookId}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else if (selectedFormat === 'EPUB') {
                setProgress("Il server Node sta preparando il file EPUB 3 (Richiede circa 10-20 secondi)...");

                const NODE_BACKEND_URL = import.meta.env.VITE_NODE_BACKEND_URL || 'http://localhost:3001';
                const response = await fetch(
                    `${NODE_BACKEND_URL}/export/epub`, // Node.js server port
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ bookId })
                    }
                );

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: "Errore sconosciuto" }));
                    throw new Error(error.error || "Errore durante la generazione dell'EPUB");
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `libro_${bookId}.epub`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                // Other formats through n8n (PNG, etc.)
                const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'EXPORT',
                        bookId,
                        format: selectedFormat.toLowerCase()
                    })
                });

                if (!response.ok) throw new Error(`Errore server: ${response.statusText}`);

                const responseData = await response.json();
                const data = Array.isArray(responseData) ? responseData[0] : responseData;

                const blob = new Blob([data.html], { type: 'text/html' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `libro_${bookId}.${selectedFormat.toLowerCase()}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }

            setFinished(true);
        } catch (err: any) {
            console.error("Export failed:", err);
            alert(`Errore durante l'esportazione: ${err.message}`);
        } finally {
            setExporting(false);
            setProgress("");
        }
    };

    return (
        <div className="container-narrow fade-in" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            {!finished ? (
                <>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Il tuo libro è pronto.</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.2rem' }}>
                        Scegli il formato e scarica il tuo capolavoro.
                    </p>

                    {errorMsg && (
                        <div style={{
                            padding: '1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--error)',
                            borderRadius: '8px',
                            color: 'var(--error)',
                            marginBottom: '2rem',
                            maxWidth: '600px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}>
                            {errorMsg}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '3rem' }}>
                        {[
                            { id: 'PDF', icon: FileText, label: 'Documento PDF (Qualità Stampa)' },
                            { id: 'EPUB', icon: Smartphone, label: 'ePub (E-reader)' },
                            { id: 'PNG', icon: Image, label: 'Immagine PNG' },
                        ].map((fmt) => (
                            <motion.div
                                key={fmt.id}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setSelectedFormat(fmt.id)}
                                className="glass-panel"
                                style={{
                                    padding: '2rem',
                                    cursor: 'pointer',
                                    border: selectedFormat === fmt.id ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                    width: '240px',
                                    background: selectedFormat === fmt.id ? 'rgba(79, 70, 229, 0.1)' : 'transparent'
                                }}
                            >
                                <fmt.icon size={48} color={selectedFormat === fmt.id ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.1rem' }}>{fmt.id}</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmt.label}</p>
                            </motion.div>
                        ))}
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={!selectedFormat || exporting}
                        className="btn-primary"
                        style={{ margin: '0 auto', fontSize: '1.2rem', padding: '1rem 3rem' }}
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="animate-spin" />
                                {progress || "Confezionamento..."}
                            </>
                        ) : (
                            <>
                                <Download size={24} /> Scarica Ora
                            </>
                        )}
                    </button>
                </>
            ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <CheckCircle size={80} color="var(--success)" style={{ margin: '0 auto' }} />
                    </div>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Download Completato!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        Il tuo file {selectedFormat} è stato scaricato correttamente.
                    </p>
                    <div style={{
                        width: '200px',
                        height: '300px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #0f172a 100%)',
                        margin: '0 auto',
                        borderRadius: '4px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '1.5rem',
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        COPERTINA
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default ExportPage;