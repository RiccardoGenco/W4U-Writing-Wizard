import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Book, Plus, Loader2, MessageSquare, AlertCircle,
  RefreshCw, ChevronRight, Layout, Settings, History,
  BarChart3, CheckCircle2, Cloud
} from 'lucide-react';
import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase (Safe initialization)
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// --- TYPES ---
interface BookProject {
  id: string;
  titolo: string;
  stato: string;
  parole_target: number;
  parole_attuali: number;
  tipo_modulo: string;
  created_at: string;
}

interface ChatMessage {
  id?: string;
  role: 'ai' | 'user';
  content: string;
  created_at?: string;
}

const App: React.FC = () => {
  // Global State
  const [projects, setProjects] = useState<BookProject[]>([]);
  const [currentBook, setCurrentBook] = useState<BookProject | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<'new' | 'chat'>('new');

  // Form State
  const [formData, setFormData] = useState({
    titolo: '',
    parole_target: 15000,
    tipo_modulo: 'narrativa'
  });

  // UI State
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Initial Load & Sidebar Projects
  useEffect(() => {
    fetchProjects();

    // Recovery from last session
    const savedId = localStorage.getItem('active_book_id');
    if (savedId && savedId !== 'null') {
      loadBook(savedId);
    }
  }, []);

  // 2. Realtime Subscription
  useEffect(() => {
    if (!supabase || !currentBook) return;

    // Listen for new messages in conversation_history
    const channel = supabase
      .channel(`chat-${currentBook.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_history',
          filter: `session_id=eq.${currentBook.id}`
        },
        (payload) => {
          console.log('Realtime Update:', payload);
          const newMessage = payload.new as any;
          if (!newMessage) return;

          // Mapping robusto per tutti i possibili formati di n8n/LangChain
          const content = newMessage.message?.text ||
            newMessage.content ||
            newMessage.message?.content ||
            newMessage.text;

          const role = (newMessage.message?.type === 'human' || newMessage.role === 'user') ? 'user' : 'ai';

          if (content) {
            setMessages(prev => {
              if (prev.some(m => m.content === content)) return prev;
              return [...prev, { role, content }];
            });
            setIsSynced(true);
            setLoading(false);
          }
        }
      )
      .subscribe((status) => {
        console.log("Supabase Realtime Status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBook]);

  // 3. Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. Input handling
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const fetchProjects = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('progetti_libri')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setProjects(data);
  };

  const loadBook = async (id: string, isManualSync = false) => {
    if (!supabase) return;
    if (!isManualSync) setLoading(true);

    try {
      // Fetch book details
      const { data: book, error: bErr } = await supabase
        .from('progetti_libri')
        .select('*')
        .eq('id', id)
        .single();

      if (bErr) throw bErr;

      // Fetch history
      const { data: history, error: hErr } = await supabase
        .from('conversation_history')
        .select('*')
        .eq('session_id', id)
        .order('id', { ascending: true }); // Assuming ID or created_at for order

      if (hErr) throw hErr;

      setCurrentBook(book);

      const mappedMessages = (history || []).map(m => ({
        role: (m.message?.type === 'human' || m.role === 'user') ? 'user' : 'ai',
        content: m.message?.text || m.content || m.message?.content || m.text || ''
      })).filter(m => m.content !== '');

      setMessages(mappedMessages as ChatMessage[]);
      if (!isManualSync) setView('chat');
      if (!isManualSync) localStorage.setItem('active_book_id', id);
      if (isManualSync) setIsSynced(true);
    } catch (err) {
      console.error("Sync Error:", err);
      if (!isManualSync) setError("Errore nel caricamento del libro.");
    } finally {
      if (!isManualSync) setLoading(false);
    }
  };

  const handleStartProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error(`Status: ${response.status}`);

      const data = await response.json();
      const bookId = data.id || data.id_libro;

      if (!bookId) throw new Error("ID non ricevuto");

      // Reload all to sync
      await fetchProjects();
      await loadBook(bookId);
    } catch (err) {
      setError("Impossibile connettersi a n8n. Controlla il webhook.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !currentBook || loading) return;

    const currentMsg = userInput;
    setUserInput('');
    setLoading(true);
    setIsSynced(false);

    // Optimistic Update
    setMessages(prev => [...prev, { role: 'user', content: currentMsg }]);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_libro: currentBook.id,
          risposta: currentMsg
        })
      });

      if (!response.ok) throw new Error();

      const data = await response.json();
      console.log("n8n Response Data:", data);

      if (data.status === 'success') {
        const nuovoMessaggioAI: ChatMessage = {
          role: 'ai',
          content: data.output
        };

        setMessages(prev => {
          if (prev.some(m => m.content === nuovoMessaggioAI.content)) return prev;
          return [...prev, nuovoMessaggioAI];
        });
        setIsSynced(true);
      } else {
        // Fallback se n8n non risponde col formato atteso o è in corso
        setTimeout(() => loadBook(currentBook.id, true), 1500);
      }

      // SBLOCCO SEMPRE IL LOADER qui per evitare che l'interfaccia rimanga ferma
      setLoading(false);

    } catch (err) {
      console.error("Fetch Error:", err);
      setError("Errore di invio. Prova a ricaricare.");
      setLoading(false);
    }
    // NOTA: il setLoading(false) nel finally è rimosso per lasciarlo gestire alla Realtime o alla risposta
  };

  const exportBook = () => {
    const content = messages
      .map(m => `${m.role === 'user' ? 'AUTORE' : 'EDITOR'}:\n${m.content}\n`)
      .join('\n---\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentBook?.titolo || 'libro'}_bozza.txt`;
    a.click();
  };

  return (
    <div className="layout-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
          <div style={{ background: 'var(--primary)', padding: '0.4rem', borderRadius: '10px' }}>
            <Book size={20} color="white" />
          </div>
          <h2 style={{ fontSize: '1.25rem' }}>GhostWriter</h2>
        </div>

        <button
          onClick={() => { setView('new'); setCurrentBook(null); localStorage.removeItem('active_book_id'); }}
          className="btn-primary"
          style={{ width: '100%', marginBottom: '2rem', padding: '0.6rem' }}
        >
          <Plus size={18} /> Nuovo Libro
        </button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '1rem', paddingLeft: '0.5rem' }}>
            I TUOI PROGETTI
          </p>
          {projects.map(p => (
            <div
              key={p.id}
              className={`sidebar-item ${currentBook?.id === p.id ? 'active' : ''}`}
              onClick={() => loadBook(p.id)}
            >
              <History size={16} />
              <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.titolo}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
          <div className="sidebar-item">
            <Layout size={18} /> <span>Dashboard</span>
          </div>
          <div className="sidebar-item">
            <Settings size={18} /> <span>Impostazioni</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <div className="container-narrow fade-in">
          {view === 'new' ? (
            <section style={{ marginTop: '10vh' }}>
              <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Scrivi il tuo capolavoro.</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                  Un assistente AI dedicato che ti guida dall'idea alla pubblicazione.
                </p>
              </header>

              <div className="glass-panel" style={{ padding: '2.5rem' }}>
                <form onSubmit={handleStartProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>TITOLO OPERA</label>
                    <input
                      placeholder="Inserisci un titolo evocativo..."
                      value={formData.titolo}
                      onChange={e => setFormData({ ...formData, titolo: e.target.value })}
                      required
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>TARGET PAROLE</label>
                      <input
                        type="number"
                        value={formData.parole_target}
                        onChange={e => setFormData({ ...formData, parole_target: parseInt(e.target.value) })}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>FORMATO</label>
                      <select
                        value={formData.tipo_modulo}
                        onChange={e => setFormData({ ...formData, tipo_modulo: e.target.value })}
                      >
                        <option value="narrativa">Narrativa</option>
                        <option value="saggistica">Saggistica</option>
                        <option value="biografia">Biografia</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading} style={{ height: '3.5rem', marginTop: '1rem' }}>
                    {loading ? <Loader2 className="animate-spin" /> : 'Crea Progetto'}
                  </button>
                </form>
              </div>
            </section>
          ) : (
            <section style={{ display: 'flex', flexDirection: 'column', height: '90vh' }}>
              {/* TOP STATUS BAR */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem' }}>{currentBook?.titolo}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={12} /> Stato: {currentBook?.stato}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {isSynced ? <><Cloud size={12} /> Sincronizzato</> : <><Loader2 size={12} className="animate-spin" /> In attesa di n8n...</>}
                      <button
                        onClick={() => loadBook(currentBook?.id || '', true)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline' }}
                      >
                        (Sincronizza ora)
                      </button>
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <button onClick={exportBook} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                    <Cloud size={14} /> Esporta .txt
                  </button>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <BarChart3 size={12} style={{ marginRight: '4px' }} />
                    Progress: {currentBook?.parole_attuali || 0} / {currentBook?.parole_target} parole
                  </div>
                  <div className="progress-container" style={{ width: '150px' }}>
                    <div
                      className="progress-bar"
                      style={{ width: `${Math.min(((currentBook?.parole_attuali || 0) / (currentBook?.parole_target || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* CHAT AREA */}
              <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                    }}>
                      <div
                        className="markdown-content"
                        style={{
                          background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                          padding: '1.2rem 1.5rem',
                          borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                          border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                          boxShadow: msg.role === 'user' ? '0 10px 15px -3px rgba(79, 70, 229, 0.3)' : 'none'
                        }}
                        dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                      />
                    </div>
                  ))}
                  {loading && (
                    <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <Loader2 className="animate-spin" size={16} /> L'IA sta elaborando un capitolo lungo, attendi...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* INPUT */}
                <div style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.4)', borderTop: '1px solid var(--glass-border)' }}>
                  <div style={{ position: 'relative' }}>
                    <textarea
                      ref={textareaRef}
                      placeholder="Invia un messaggio all'editor..."
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={1}
                      style={{
                        width: '100%',
                        paddingRight: '4rem',
                        maxHeight: '200px',
                        minHeight: '56px',
                        background: 'rgba(15, 23, 42, 0.8)'
                      }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!userInput.trim() || loading}
                      className="btn-primary"
                      style={{
                        position: 'absolute', right: '8px', bottom: '8px',
                        padding: '0.6rem', borderRadius: '10px'
                      }}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                  {error && (
                    <div style={{ marginTop: '0.75rem', color: 'var(--error)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertCircle size={14} /> {error} <button onClick={() => setError(null)} style={{ background: 'none', color: 'white', textDecoration: 'underline', padding: 0 }}>Riprova</button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
};

export default App;
