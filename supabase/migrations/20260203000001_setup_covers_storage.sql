-- Migration: Setup Supabase Storage for Book Covers
-- Created: 2026-02-03
-- Purpose: Configure bucket and policies for storing AI-generated book cover images

-- ============================================
-- STEP 1: Create the "covers" bucket
-- ============================================

-- Create bucket for book covers (public access for viewing)
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'covers', 
    'covers', 
    true,  -- Public bucket so covers can be viewed without auth
    false, 
    5242880,  -- 5MB limit per image
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']  -- Allowed image formats
)
ON CONFLICT (id) DO NOTHING;  -- Skip if bucket already exists

-- ============================================
-- STEP 2: Create Storage Policies
-- ============================================

-- Policy 1: Allow authenticated users to upload images to 'covers' bucket
create policy "Allow authenticated uploads to covers"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'covers' 
    AND (storage.foldername(name))[1] IS NOT NULL
);

-- Policy 2: Allow service role to upload (for n8n backend)
create policy "Allow service role uploads to covers"
on storage.objects for insert
to service_role
with check (
    bucket_id = 'covers'
);

-- Policy 3: Allow public read access to all covers (images are public)
create policy "Allow public read access to covers"
on storage.objects for select
to anon
using (bucket_id = 'covers');

-- Policy 4: Allow authenticated users to delete their own covers
create policy "Allow authenticated deletes on covers"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 5: Allow service role to manage all covers (update/delete)
create policy "Allow service role full access to covers"
on storage.objects for all
to service_role
using (bucket_id = 'covers')
with check (bucket_id = 'covers');

-- ============================================
-- STEP 3: Create RLS Policy for books.cover_url
-- ============================================

-- Ensure RLS is enabled on books table
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view books with cover URLs
create policy "Allow users to view book covers"
on books for select
to authenticated
using (true);

-- Policy to allow users to update their own book covers
create policy "Allow users to update their book covers"
on books for update
to authenticated
using (true)
with check (true);

-- ============================================
-- STEP 4: Create Helper Function for Cover Path
-- ============================================

-- Function to generate cover storage path
create or replace function generate_cover_path(book_id uuid)
returns text
language plpgsql
security definer
as $$
begin
    return 'covers/' || book_id::text || '_cover.png';
end;
$$;

-- ============================================
-- STEP 5: Add Trigger to Auto-delete Cover on Book Delete
-- ============================================

-- Note: This requires additional setup in application layer or storage triggers
-- For now, manual cleanup is recommended or implement in backend

-- ============================================
-- VERIFICATION QUERIES (Run these to verify setup)
-- ============================================

-- Check if bucket exists
-- SELECT * FROM storage.buckets WHERE id = 'covers';

-- Check storage policies
-- SELECT * FROM storage.policies WHERE bucket_id = 'covers';

-- Test cover_url column exists
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'books' AND column_name = 'cover_url';

-- ============================================
-- USAGE NOTES
-- ============================================

/*

STORAGE PATH STRUCTURE:
- covers/{bookId}_cover.png
- Example: covers/123e4567-e89b-12d3-a456-426614174000_cover.png

CURL EXAMPLES:

1. Upload cover (from n8n/backend):
curl -X POST 'https://YOUR_PROJECT.supabase.co/storage/v1/object/covers/{bookId}_cover.png' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: image/png' \
  --data-binary '@cover.png'

2. Get public URL:
https://YOUR_PROJECT.supabase.co/storage/v1/object/public/covers/{bookId}_cover.png

3. Download cover:
curl 'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/covers/{bookId}_cover.png'

SECURITY NOTES:
- Bucket is PUBLIC for reading (covers need to be viewable by anyone)
- Uploads restricted to authenticated users and service role
- 5MB file size limit
- Only image formats allowed
- Consider implementing rate limiting at application level

COST OPTIMIZATION:
- Enable automatic image compression if needed
- Monitor storage usage regularly
- Implement cleanup for unused covers

*/
