import fs from 'fs';

const filePath = './w4u_workflow.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let patched = false;
workflow.nodes.forEach(n => {
    if (n.name === 'Init Book (Optional)' && n.parameters && n.parameters.query) {
        // The old query inserts: id, title, author, genre, status, context_data
        // The database now has: target_pages NOT NULL column
        // So we add target_pages = $6::integer (or coalesce with 100, the safe default)
        
        n.parameters.query = `INSERT INTO books (id, title, author, genre, status, context_data, target_pages) 
VALUES (
  $1::uuid, 
  $2, 
  $3, 
  $4, 
  'INTERVIEW', 
  jsonb_build_object(
    'messages', CASE WHEN $5 IS NOT NULL AND $5 != '' THEN jsonb_build_array(jsonb_build_object('role', 'user', 'content', $5)) ELSE '[]'::jsonb END,
    'target_pages', $6::integer
  ),
  $6::integer
) 
ON CONFLICT (id) DO UPDATE SET 
  title = CASE WHEN EXCLUDED.title IS NOT NULL AND EXCLUDED.title NOT IN ('', 'Nuovo Libro', 'Nuovo Progetto') THEN EXCLUDED.title ELSE books.title END,
  author = COALESCE(EXCLUDED.author, books.author),
  genre = COALESCE(EXCLUDED.genre, books.genre),
  target_pages = COALESCE(EXCLUDED.target_pages, books.target_pages),
  context_data = jsonb_set(
    jsonb_set(
      books.context_data,
      '{target_pages}',
      COALESCE(EXCLUDED.context_data->'target_pages', books.context_data->'target_pages', '100'::jsonb)
    ),
    '{messages}',
    COALESCE(books.context_data->'messages', '[]'::jsonb) || 
    CASE WHEN $5 IS NOT NULL AND $5 != '' THEN jsonb_build_array(jsonb_build_object('role', 'user', 'content', $5)) ELSE '[]'::jsonb END
  )
RETURNING id;`;

        patched = true;
    }
});

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
console.log(patched ? 'Init Book node patched successfully!' : 'Node not found!');
