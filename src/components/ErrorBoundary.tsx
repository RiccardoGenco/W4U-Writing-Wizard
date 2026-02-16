import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#050508',
                    color: 'white',
                    padding: '2rem'
                }}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '3rem',
                        borderRadius: '16px',
                        textAlign: 'center',
                        maxWidth: '500px',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{
                            display: 'inline-flex',
                            padding: '1rem',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            marginBottom: '1.5rem'
                        }}>
                            <AlertTriangle size={48} />
                        </div>

                        <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Qualcosa è andato storto</h1>
                        <p style={{ color: '#94a3b8', marginBottom: '2rem', lineHeight: 1.6 }}>
                            Si è verificato un errore imprevisto. Abbiamo notificato il problema.
                            Per favore ricarica la pagina.
                        </p>

                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
                        >
                            <RefreshCcw size={18} />
                            Ricarica Pagina
                        </button>

                        {this.state.error && import.meta.env.DEV && (
                            <pre style={{
                                marginTop: '2rem',
                                padding: '1rem',
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: '8px',
                                overflowX: 'auto',
                                fontSize: '0.75rem',
                                color: '#f87171',
                                textAlign: 'left'
                            }}>
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
