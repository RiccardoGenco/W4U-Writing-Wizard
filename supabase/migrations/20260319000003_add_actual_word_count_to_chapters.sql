-- Migration: add actual_word_count to chapters (needed by chapter compilation)

alter table public.chapters
    add column if not exists actual_word_count integer;

comment on column public.chapters.actual_word_count is 'Computed total word count for the chapter content';
