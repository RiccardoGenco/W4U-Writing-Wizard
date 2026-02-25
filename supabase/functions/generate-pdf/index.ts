import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { marked } from "https://esm.sh/marked@9.1.6";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { bookId } = await req.json();

        if (!bookId) {
            throw new Error("bookId is required");
        }

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: book, error: bookError } = await supabaseClient
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

        if (bookError || !book) throw new Error("Book not found");

        const { data: chapters, error: chaptersError } = await supabaseClient
            .from("chapters")
            .select("*")
            .eq("book_id", bookId)
            .eq("status", "COMPLETED")
            .order("chapter_number", { ascending: true });

        if (chaptersError) throw new Error("Error fetching chapters");

        const chapterIds = chapters.map((c: any) => c.id);
        const { data: paragraphs, error: paragraphsError } = await supabaseClient
            .from("paragraphs")
            .select("*")
            .in("chapter_id", chapterIds)
            .order("paragraph_number", { ascending: true });

        if (paragraphsError) throw new Error("Error fetching paragraphs");

        let chaptersHtml = "";
        chapters.forEach((ch: any) => {
            const chParagraphs = paragraphs.filter((p: any) => p.chapter_id === ch.id);
            const compiledMarkdown = chParagraphs.map((p: any) => p.content || '').join('\n\n');
            const semanticHtml = marked.parse(compiledMarkdown);

            chaptersHtml += '<section class="chapter">';
            chaptersHtml += '<h2 class="chapter-title">' + (ch.title || 'Senza Titolo') + '</h2>';
            chaptersHtml += '<div class="chapter-content">' + semanticHtml + '</div>';
            chaptersHtml += '</section>';
        });

        const authorName = book.author || 'Autore Sconosciuto';
        const publishYear = new Date().getFullYear();
        const copyrightStr = `Copyright &copy; ${publishYear} ${authorName}. Tutti i diritti riservati.`;
        const synopsis = book.context_data?.selected_concept?.description || '';

        const htmlContent = [
            '<!DOCTYPE html>',
            '<html lang="it">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <style>',
            '    @page { size: A4; margin: 2.5cm; }',
            "    body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #333; text-align: justify; margin: 0; padding: 0; }",
            '    .front-matter { text-align: center; padding-top: 35%; page-break-after: always; }',
            '    h1.book-title { font-size: 36pt; margin: 0 0 0.5cm 0; }',
            '    h2.book-author { font-size: 18pt; font-weight: normal; color: #555; margin: 0; }',
            '    .copyright-page { font-size: 10pt; text-align: center; padding-top: 80%; page-break-after: always; color: #666; }',
            '    .intro-page { page-break-after: always; padding-top: 10%; }',
            '    .chapter { page-break-before: always; }',
            "    .chapter-title { font-size: 24pt; margin-top: 0; margin-bottom: 1.5cm; text-align: left; border-bottom: 1px solid #eee; padding-bottom: 10pt; }",
            '    .chapter-content { orphans: 3; widows: 3; }',
            '    p { margin-bottom: 12pt; text-indent: 0; }',
            '    p + p { text-indent: 1.5em; margin-top: -12pt; }',
            '  </style>',
            '</head>',
            '<body>',
            '  <div class="front-matter">',
            '    <h1 class="book-title">' + (book.title || 'Senza Titolo') + '</h1>',
            '    <h2 class="book-author">' + authorName + '</h2>',
            '  </div>',
            '  <div class="copyright-page">',
            '    <p>' + copyrightStr + '</p>',
            '    <p>Impaginato e generato tramite W4U.</p>',
            '  </div>',
            synopsis ? '  <div class="intro-page"><h2>Sinossi</h2><p>' + synopsis + '</p></div>' : '',
            chaptersHtml,
            '</body>',
            '</html>'
        ].join('\\n');

        const BROWSERLESS_API_KEY = Deno.env.get("BROWSERLESS_API_KEY");
        if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY secret");

        const browserlessUrl = "https://chrome.browserless.io/pdf?token=" + BROWSERLESS_API_KEY;

        const pdfResponse = await fetch(browserlessUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                html: htmlContent,
                options: {
                    displayHeaderFooter: true,
                    printBackground: true,
                    format: "A4",
                    margin: { top: "2.5cm", bottom: "2.5cm", left: "2.5cm", right: "2.5cm" },
                },
            }),
        });

        if (!pdfResponse.ok) {
            const errorText = await pdfResponse.text();
            throw new Error("Browserless error: " + errorText);
        }

        const pdfBuffer = await pdfResponse.arrayBuffer();

        return new Response(pdfBuffer, {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="libro-' + bookId + '.pdf"',
            },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
