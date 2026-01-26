import React, { useState } from 'react';
import { Download, FileText, Smartphone, Image, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const ExportPage: React.FC = () => {
    const [exporting, setExporting] = useState(false);
    const [finished, setFinished] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

    const handleExport = async () => {
        if (!selectedFormat) return;

        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) {
            alert("Errore: ID libro non trovato.");
            return;
        }

        setExporting(true);
        try {
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

            if (selectedFormat === 'PDF') {
                const opt = {
                    margin: 1,
                    filename: `libro_${bookId}.pdf`,
                    image: { type: 'jpeg' as const, quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
                };

                // Create a temporary element to hold the HTML
                const element = document.createElement('div');
                element.innerHTML = data.html;

                await html2pdf().set(opt).from(element).save();
            } else {
                // For now, if format is not PDF (like EPUB), download as HTML or show message
                // This is a placeholder since user wanted to focus on SaaS-ready PDF via Gotenberg alternative
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

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '3rem' }}>
                        {[
                            { id: 'PDF', icon: FileText, label: 'Documento PDF' },
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
                                    width: '200px',
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
                        {exporting ? <><Loader2 className="animate-spin" /> Confezionamento...</> : <><Download size={24} /> Scarica Ora</>}
                    </button>
                </>
            ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <CheckCircle size={80} color="var(--success)" style={{ margin: '0 auto' }} />
                    </div>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Download Completato!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        Il tuo file {selectedFormat} è stato scaricato correttamente nella tua cartella Download.
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
