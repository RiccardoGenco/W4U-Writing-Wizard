-- Abilita l'estensione pgvector (assicurati che il tuo progetto Supabase lo supporti)
create extension if not exists vector;

-- Crea la tabella per conservare i frammenti della bozza
create table if not exists public.draft_chunks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536), -- 1536 dimensions for OpenAI text-embedding-3-small
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indice opzionale per velocizzare la ricerca (HNSW)
-- CREATE INDEX ON public.draft_chunks USING hnsw (embedding vector_cosine_ops);

-- Crea la funzione RPC per interrogare i vettori (Ricerca per similarità del Coseno)
create or replace function public.match_draft_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_book_id uuid
)
returns table (
  id uuid,
  book_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    draft_chunks.id,
    draft_chunks.book_id,
    draft_chunks.content,
    1 - (draft_chunks.embedding <=> query_embedding) as similarity
  from public.draft_chunks
  where draft_chunks.book_id = filter_book_id
    and 1 - (draft_chunks.embedding <=> query_embedding) > match_threshold
  order by draft_chunks.embedding <=> query_embedding
  limit match_count;
$$;
