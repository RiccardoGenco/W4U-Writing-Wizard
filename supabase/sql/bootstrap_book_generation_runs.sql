-- Idempotent bootstrap for backend book generation orchestration
-- Use this if the remote database was never migrated with the local repo migrations.

create table if not exists public.book_generation_runs (
    id uuid primary key default gen_random_uuid(),
    book_id uuid not null references public.books(id) on delete cascade,
    created_by uuid not null references auth.users(id) on delete cascade,
    status text not null default 'pending',
    phase text not null default 'outline',
    current_chapter_id uuid null references public.chapters(id) on delete set null,
    current_chapter_number integer null,
    target_total_words integer not null,
    actual_total_words integer null default 0,
    expected_chapters integer null,
    completed_chapters integer null default 0,
    last_error text null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint book_generation_runs_status_check check (
        status in ('pending', 'planning', 'writing', 'review', 'completed', 'failed')
    ),
    constraint book_generation_runs_phase_check check (
        phase in ('outline', 'scaffold', 'write_chapter', 'final_review')
    )
);

create index if not exists idx_book_generation_runs_book_id
    on public.book_generation_runs(book_id);

create index if not exists idx_book_generation_runs_created_by
    on public.book_generation_runs(created_by);

create index if not exists idx_book_generation_runs_status
    on public.book_generation_runs(status);

create index if not exists idx_book_generation_runs_updated_at
    on public.book_generation_runs(updated_at desc);

alter table public.book_generation_runs enable row level security;

drop policy if exists "Users can view their own book generation runs" on public.book_generation_runs;
create policy "Users can view their own book generation runs"
    on public.book_generation_runs
    for select
    using (auth.uid() = created_by);

drop policy if exists "Users can insert their own book generation runs" on public.book_generation_runs;
create policy "Users can insert their own book generation runs"
    on public.book_generation_runs
    for insert
    with check (auth.uid() = created_by);

drop policy if exists "Service role can update book generation runs" on public.book_generation_runs;
create policy "Service role can update book generation runs"
    on public.book_generation_runs
    for update
    using (true);
