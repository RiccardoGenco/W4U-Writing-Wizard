import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/api';

const MockBookPage: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState('Inizializzazione...');

    useEffect(() => {
        const createMock = async () => {
            try {
                // Check session
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setStatus("ERRORE: Devi effettuare il log-in nell'app prima!");
                    return;
                }

                setStatus('1. Creazione Libro...');
                const { data: bookData, error: bookError } = await supabase
                    .from('books')
                    .insert({
                        title: "Il Mistero W4U (Esempio)",
                        author: "Autore Demo",
                        genre: "Mistero",
                        status: "COMPLETED",
                        target_chapters: 2,
                        context_data: {
                            selected_concept: {
                                title: "Il Mistero W4U",
                                description: "Un libro generato automaticamente.",
                                style: "professionale"
                            }
                        },
                        user_id: session.user.id
                    })
                    .select()
                    .single();

                if (bookError) throw bookError;
                const bookId = bookData.id;

                setStatus('2. Creazione Capitoli...');
                const chaptersToInsert = [
                    { book_id: bookId, chapter_number: 1, title: "L'inizio", summary: "Intro.", status: "COMPLETED" },
                    { book_id: bookId, chapter_number: 2, title: "La fine", summary: "Outro.", status: "COMPLETED" }
                ];

                const { data: chaptersData, error: chaptersError } = await supabase
                    .from('chapters')
                    .insert(chaptersToInsert)
                    .select('id');

                if (chaptersError) throw chaptersError;

                setStatus('3. Creazione Paragrafi...');
                const paragraphsToInsert = [
                    { chapter_id: chaptersData[0].id, paragraph_number: 1, title: "Scena 1", description: "Desc", content: "Markdown text per scena 1. La casa era buia.", status: "COMPLETED" },
                    { chapter_id: chaptersData[0].id, paragraph_number: 2, title: "Scena 2", description: "Desc", content: "Qualcuno bussò alla porta.", status: "COMPLETED" },
                    { chapter_id: chaptersData[1].id, paragraph_number: 1, title: "Scena 3", description: "Desc", content: "Era solo il postino.", status: "COMPLETED" },
                    { chapter_id: chaptersData[1].id, paragraph_number: 2, title: "Scena 4", description: "Desc", content: "Tutto finì bene. Fine.", status: "COMPLETED" }
                ];

                const { error: paragraphsError } = await supabase.from('paragraphs').insert(paragraphsToInsert);
                if (paragraphsError) throw paragraphsError;

                setStatus('Completato! Navigazione in corso...');
                localStorage.setItem('active_book_id', bookId);
                setTimeout(() => {
                    navigate('/create/export');
                }, 1500);

            } catch (err: any) {
                console.error(err);
                setStatus('ERRORE: ' + err.message);
            }
        };

        createMock();
    }, [navigate]);

    return (
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
            <h2>Generazione Libro d'Esempio in Corso</h2>
            <p style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>{status}</p>
        </div>
    );
};

export default MockBookPage;
