import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testConfirm() {
    const bookId = '2f5618e8-7ab1-4633-81d3-c77fce72bdbb';
    const chapters = [{"title":"Test 1","summary":"sum 1"}];

    try {
        const { data: book, error: bookError } = await supabase
            .from('books')
            .select('target_pages, target_chapters, configuration')
            .eq('id', bookId)
            .single();

        if (bookError) throw bookError;
        console.log("Book select OK", book);

        const dbChapters = chapters.map((c, index) => ({
            book_id: bookId,
            chapter_number: index + 1,
            title: c.title,
            summary: c.summary,
            status: 'PENDING'
        }));

        const { data: insertedChapters, error } = await supabase
            .from('chapters')
            .insert(dbChapters)
            .select('id, chapter_number, title');

        if (error) throw error;
        console.log("Chapters insert OK", insertedChapters);

    } catch (e) {
        console.error("ERROR CAUGHT", JSON.stringify(e, null, 2));
        console.error("Raw error:", e);
    }
}

testConfirm();
