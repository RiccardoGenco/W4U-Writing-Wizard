DROP VIEW IF EXISTS public.vw_cost_per_book;
DROP VIEW IF EXISTS public.vw_cost_per_user;

-- Update the Book Cost View to include user email and name
CREATE OR REPLACE VIEW public.vw_cost_per_book AS
SELECT 
    b.id AS book_id,
    b.title,
    b.user_id,
    au.email AS user_email,
    au.raw_user_meta_data->>'author_name' AS author_name,
    COUNT(l.id) AS total_requests,
    COALESCE(SUM(l.prompt_tokens), 0) AS total_prompt_tokens,
    COALESCE(SUM(l.completion_tokens), 0) AS total_completion_tokens,
    COALESCE(SUM(l.total_tokens), 0) AS total_tokens,
    COALESCE(SUM(l.estimated_cost_eur), 0.0) AS total_estimated_cost_eur
FROM 
    public.books b
LEFT JOIN 
    auth.users au ON b.user_id = au.id
LEFT JOIN 
    public.ai_usage_logs l ON b.id = l.book_id
GROUP BY 
    b.id, b.title, b.user_id, au.email, au.raw_user_meta_data->>'author_name';

-- Update the User Cost View to include user email and name
CREATE OR REPLACE VIEW public.vw_cost_per_user AS
SELECT 
    p.id AS user_id,
    au.email AS user_email,
    au.raw_user_meta_data->>'author_name' AS author_name,
    COUNT(DISTINCT l.book_id) AS total_books_generated,
    COUNT(l.id) AS total_requests,
    COALESCE(SUM(l.prompt_tokens), 0) AS total_prompt_tokens,
    COALESCE(SUM(l.completion_tokens), 0) AS total_completion_tokens,
    COALESCE(SUM(l.total_tokens), 0) AS total_tokens,
    COALESCE(SUM(l.estimated_cost_eur), 0.0) AS total_estimated_cost_eur
FROM 
    public.profiles p
LEFT JOIN 
    auth.users au ON p.id = au.id
LEFT JOIN 
    public.ai_usage_logs l ON p.id = l.user_id
GROUP BY 
    p.id, au.email, au.raw_user_meta_data->>'author_name';
