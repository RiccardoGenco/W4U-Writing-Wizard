import React, { useState } from 'react';
import { Download, FileText, Smartphone, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase, logDebug } from '../../lib/api';

type ExportOption = {
    id: string;
    endpoint: '/export/pdf' | '/export/epub' | '/export/docx';
    format: 'PDF' | 'EPUB' | 'DOCX';
    edition: 'ebook' | 'paperback';
    icon: typeof FileText;
    title: string;
    label: string;
    filename: (bookId: string) => string;
    progress: string;
};

const EXPORT_OPTIONS: ExportOption[] = [
    {
        id: 'DOCX_EBOOK',
        endpoint: '/export/docx',
        format: 'DOCX',
        edition: 'ebook',
        icon: FileText,
        title: 'Word eBook',
        label: 'Word per eBook',
        filename: (bookId) => `libro_${bookId}_ebook.docx`,
        progress: 'Il server sta preparando il Word per eBook...'
    },
    {
        id: 'EPUB_EBOOK',
        endpoint: '/export/epub',
        format: 'EPUB',
        edition: 'ebook',
        icon: Smartphone,
        title: 'EPUB eBook',
        label: 'EPUB senza copertina',
        filename: (bookId) => `libro_${bookId}.epub`,
        progress: "Il server sta preparando l'EPUB senza copertina..."
    },
    {
        id: 'PDF_EBOOK',
        endpoint: '/export/pdf',
        format: 'PDF',
        edition: 'ebook',
        icon: FileText,
        title: 'PDF eBook',
        label: 'PDF con copertina front, senza numeri pagina',
        filename: (bookId) => `libro_${bookId}_ebook.pdf`,
        progress: 'Il server sta impaginando il PDF eBook...'
    },
    {
        id: 'DOCX_PAPERBACK',
        endpoint: '/export/docx',
        format: 'DOCX',
        edition: 'paperback',
        icon: FileText,
        title: 'Word Cartaceo',
        label: 'Word con blank page, numeri pagina, front e back cover',
        filename: (bookId) => `libro_${bookId}_cartaceo.docx`,
        progress: 'Il server sta preparando il Word per il cartaceo...'
    }
];

const ExportPage: React.FC = () => {
    const [exporting, setExporting] = useState(false);
    const [finished, setFinished] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleExport = async () => {
        if (!selectedFormat) return;
        setErrorMsg(null);

        const selectedOption = EXPORT_OPTIONS.find((option) => option.id === selectedFormat);
        if (!selectedOption) {
            setErrorMsg("Formato export non valido.");
            return;
        }

        const bookId = localStorage.getItem('active_book_id');
        if (!bookId) {
            setErrorMsg("Errore: ID libro non trovato. Torna alla dashboard e riapri il progetto.");
            return;
        }

        setExporting(true);
        try {
            await logDebug('frontend', `export_start_${selectedOption.id.toLowerCase()}`, {
                bookId,
                format: selectedOption.format,
                edition: selectedOption.edition
            }, bookId);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error("Utente non autenticato. Effettua il login.");
            }

            const authHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            setProgress(selectedOption.progress);

            const response = await fetch(selectedOption.endpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    bookId,
                    edition: selectedOption.edition
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: "Errore sconosciuto" }));
                throw new Error(error.error || `Errore durante la generazione del file ${selectedOption.title}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedOption.filename(bookId);
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            await logDebug('frontend', `export_${selectedOption.id.toLowerCase()}_success`, {
                bookId,
                format: selectedOption.format,
                edition: selectedOption.edition
            }, bookId);

            setFinished(true);
        } catch (err: any) {
            console.error("Export failed:", err);
            setErrorMsg(`Errore durante l'esportazione: ${err.message}`);
            await logDebug('frontend', 'export_failed', {
                error: err.message,
                stack: err.stack,
                format: selectedOption.format,
                edition: selectedOption.edition
            }, bookId);
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
                        Scegli il tipo di export giusto per eBook o stampa.
                    </p>

                    {errorMsg && (
                        <div style={{
                            padding: '1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--error)',
                            borderRadius: '8px',
                            color: 'var(--error)',
                            marginBottom: '2rem',
                            maxWidth: '700px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}>
                            {errorMsg}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '3rem', flexWrap: 'wrap' }}>
                        {EXPORT_OPTIONS.map((fmt) => (
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
                                    width: '260px',
                                    background: selectedFormat === fmt.id ? 'rgba(79, 70, 229, 0.1)' : 'transparent'
                                }}
                            >
                                <fmt.icon size={48} color={selectedFormat === fmt.id ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.1rem' }}>{fmt.title}</h3>
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
                        Il tuo file è stato scaricato correttamente.
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
                        EXPORT
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default ExportPage;
