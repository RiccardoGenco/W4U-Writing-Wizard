# Query di Health Check: Book Generation

## 1. Run recenti
```sql
select
  id,
  book_id,
  status,
  phase,
  current_chapter_number,
  target_total_words,
  actual_total_words,
  completed_chapters,
  last_error,
  updated_at
from book_generation_runs
order by updated_at desc
limit 20;
```

## 2. Richieste AI chapter-level recenti
```sql
select
  id,
  book_id,
  action,
  status,
  error_message,
  created_at,
  updated_at
from ai_requests
where action = 'WRITE_CHAPTER_FROM_PLAN'
order by created_at desc
limit 50;
```

## 3. Verifica: una request per capitolo
```sql
select
  ar.book_id,
  ar.request_payload ->> 'chapterId' as chapter_id,
  count(*) as requests_count,
  min(ar.created_at) as first_request_at,
  max(ar.created_at) as last_request_at
from ai_requests ar
where ar.action = 'WRITE_CHAPTER_FROM_PLAN'
group by ar.book_id, ar.request_payload ->> 'chapterId'
order by last_request_at desc;
```

## 4. Stato capitoli e parole
```sql
select
  c.book_id,
  c.chapter_number,
  c.title,
  c.status,
  c.actual_word_count,
  count(p.id) as paragraphs_count,
  count(*) filter (where p.status = 'COMPLETED') as completed_paragraphs
from chapters c
left join paragraphs p on p.chapter_id = c.id
group by c.book_id, c.id, c.chapter_number, c.title, c.status, c.actual_word_count
order by c.book_id, c.chapter_number;
```

## 5. Capitoli sotto soglia
Nota:
- la soglia esatta dipende da `target_pages / target_chapters * words_per_page`
- questa query usa `250 words_per_page` come fallback operativo
```sql
select
  b.id as book_id,
  b.target_pages,
  b.target_chapters,
  c.chapter_number,
  c.title,
  c.actual_word_count,
  floor((((b.target_pages::numeric * 250) / nullif(b.target_chapters, 0)) * 0.85)) as min_expected_words
from books b
join chapters c on c.book_id = b.id
where c.actual_word_count is not null
  and b.target_pages is not null
  and b.target_chapters is not null
  and c.actual_word_count < floor((((b.target_pages::numeric * 250) / nullif(b.target_chapters, 0)) * 0.85))
order by b.id, c.chapter_number;
```

## 6. Run bloccati o zombie
```sql
select
  id,
  book_id,
  status,
  phase,
  current_chapter_number,
  updated_at,
  now() - updated_at as age
from book_generation_runs
where status in ('pending', 'planning', 'writing', 'review')
  and updated_at < now() - interval '15 minutes'
order by updated_at asc;
```

## 7. Cleanup manuale run zombie
Usare solo in fase test, dopo aver verificato che il processo non sia piu attivo.
```sql
update book_generation_runs
set status = 'failed',
    last_error = coalesce(last_error, 'Timed out / abandoned run'),
    updated_at = now()
where status in ('pending', 'planning', 'writing', 'review')
  and updated_at < now() - interval '15 minutes';
```

## 8. Cleanup manuale ai_requests zombie
```sql
update ai_requests
set status = 'failed',
    error_message = coalesce(error_message, 'Timed out / abandoned ai_request'),
    updated_at = now()
where status in ('pending', 'processing')
  and updated_at < now() - interval '15 minutes';
```
