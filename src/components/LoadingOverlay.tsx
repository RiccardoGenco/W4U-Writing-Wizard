import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type LoadingPhase = 'concept' | 'configuration' | 'blueprint' | 'production' | 'editor' | 'export';

interface LoadingOverlayProps {
  isLoading: boolean;
  phase: LoadingPhase;
  progress?: number; // 0-100, opzionale
  customMessage?: string; // Override messaggi automatici
}

const PHASE_MESSAGES: Record<LoadingPhase, string[]> = {
  concept: [
    "Analisi delle tue risposte creative...",
    "Sviluppo personaggi e trama...",
    "Generazione concept unici...",
    "Finalizzazione proposte..."
  ],
  configuration: [
    "Calcolo parametri narrativi...",
    "Ottimizzazione tono di voce...",
    "Adattamento stile al target..."
  ],
  blueprint: [
    "Architettura storyline...",
    "Definizione punti di svolta...",
    "Bilanciamento capitoli...",
    "Verifica coerenza narrativa..."
  ],
  production: [
    "Scrittura creativa in corso...",
    "Sviluppo scene e dialoghi...",
    "Controllo coerenza personaggi...",
    "Finalizzazione capitolo..."
  ],
  editor: [
    "Analisi stilistica del testo...",
    "Valutazione coerenza narrativa...",
    "Generazione suggerimenti..."
  ],
  export: [
    "Impaginazione professionale...",
    "Ottimizzazione formato...",
    "Generazione file finale...",
    "Controllo qualità..."
  ]
};

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  phase,
  progress,
  customMessage
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = customMessage ? [customMessage] : PHASE_MESSAGES[phase];

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [isLoading, messages.length]);

  if (!isLoading) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="loading-overlay"
      >
        {/* Background animato */}
        <div className="loading-bg">
          <div className="loading-grid"></div>
          <div className="loading-glow"></div>
        </div>

        {/* Contenuto centrale */}
        <div className="loading-content">
          {/* Spinner cyberpunk */}
          <div className="cyber-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-core"></div>
          </div>

          {/* Messaggio con fade */}
          <div className="message-container">
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="loading-message"
              >
                {messages[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar (se fornita) */}
          {progress !== undefined ? (
            <div className="progress-container-modern">
              <div className="progress-bar-modern" style={{ width: `${progress}%` }}></div>
              <span className="progress-text">{progress}%</span>
            </div>
          ) : (
            /* Indeterminata */
            <div className="progress-indeterminate">
              <div className="indeterminate-bar"></div>
            </div>
          )}

          {/* Decorazione */}
          <div className="loading-decoration">
            <span className="scramble-text">W4U_ENGINE_v2.0</span>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoadingOverlay;