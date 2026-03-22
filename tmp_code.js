const paragraphs = $items("Get Chapter Paragraphs").map(i => i.json);
const context = $node["Get Book Context Chapter Writer"].json || {};
const webhook = $node["Webhook Router"].json.body || {};

if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
  throw new Error('No scaffold paragraphs found for chapter writer');
}

// FILTER PARAGRAPHS BASED ON RANGE (SPLIT CHAPTER LOGIC)
const range = webhook.paragraphRange;
let targetParagraphs = paragraphs;
if (Array.isArray(range) && range.length === 2) {
  targetParagraphs = paragraphs.filter(p => p.paragraph_number >= range[0] && p.paragraph_number <= range[1]);
  if (targetParagraphs.length === 0) {
     throw new Error(`No paragraphs found in range ${range[0]}-${range[1]}`);
  }
}

const model = context.primary_model || 'gpt-4o';
const temperature = context.temps.CHAPTER_WRITER || 0.5;
const systemPrompt = context.prompts.CHAPTER_WRITER || 'Sei un autore professionale. Scrivi testi coerenti, specifici e narrativamente solidi.';
const chapter = targetParagraphs[0] || {};
const chapterTitle = chapter.chapter_title || webhook.chapterTitle || 'Capitolo senza titolo';
const chapterSummary = chapter.chapter_summary || webhook.chapterSummary || '';
const targetWordCount = Number(webhook.targetWordCount);
const safeTargetWordCount = Number.isFinite(targetWordCount) && targetWordCount > 0 ? Math.round(targetWordCount) : Math.max(1200, targetParagraphs.length * 250);
const minWordCount = Math.max(800, Math.floor(safeTargetWordCount * 0.9));
const outlineStr = targetParagraphs.map((p) => `- ${p.paragraph_number}. ${p.title}\n  Obiettivo: ${p.description || '(non specificato)'}`).join('\n');
const continuity = (context.context_data?.messages || []).slice(-12).map((m) => `${m.role}: ${m.content}`).join('\n');

const userPrompt = [
  `TITOLO LIBRO: ${context.title || ''}`,
  `PLOT SUMMARY: ${context.plot_summary || ''}`,
  `BLUEPRINT: ${JSON.stringify(context.context_data || {})}`,
  `CAPITOLO: ${chapterTitle}`,
  `SINTESI CAPITOLO: ${chapterSummary}`,
  '',
  `TRACCIA DEI SOTTOCAPITOLI DA COPRIRE IN QUESTA PARTE (${webhook.partNumber || 1}/${webhook.totalParts || 1}):`,
  outlineStr,
  '',
  'CONTINUITA DALLA FASE PRECEDENTE:',
  continuity || '(non disponibile)',
  '',
  `VINCOLO LUNGHEZZA: scrivi l'intero capitolo con almeno ${minWordCount} parole e obiettivo ${safeTargetWordCount} parole complessive.`,
  'REGOLE:',
  '- Copri tutti i sottocapitoli nell ordine dato, senza saltarne nessuno.',
  '- Mantieni coerenza narrativa, evita ripetizioni e filler.',
  '- Ogni contenuto deve essere testo finale, non scalette o note metatestuali.',
  '- Restituisci SOLO JSON valido con questa forma:',
  '{"paragraphs":[{"paragraph_number":1,"content":"..."}]}',
  '- L array paragraphs deve contenere esattamente un elemento per ogni sottocapitolo previsto.',
  '- Usa gli stessi paragraph_number della traccia.'
].join('\n');

return [{
  json: {
    model,
    temperature,
    systemPrompt,
    userPrompt,
    expectedParagraphs: targetParagraphs.length,
    targetWordCount: safeTargetWordCount
  }
}];