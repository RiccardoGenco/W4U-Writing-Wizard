-- Migration: Add cover_url column to books table
-- Created: 2026-02-03

-- Add cover_url column to store the generated cover image URL
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN books.cover_url IS 'URL of the AI-generated book cover image (DALL-E 3)';

-- Create index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_books_cover_url ON books(cover_url) 
WHERE cover_url IS NOT NULL;
