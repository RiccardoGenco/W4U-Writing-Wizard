-- Migration: Add target_chapters column to books table
-- Created: 2026-02-18
-- Purpose: Support standardized chapter calculation in ConfigurationPage.tsx

-- Add the target_chapters column
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS target_chapters INTEGER;

-- Add column comment for documentation
COMMENT ON COLUMN books.target_chapters IS 'Pre-calculated target chapter count using Math.max(1, Math.floor(targetPages / chaptersRate)). Set during book configuration.';

-- Optional: Create an index if you plan to filter/sort by chapter count
-- CREATE INDEX IF NOT EXISTS idx_books_target_chapters ON books(target_chapters);

-- Verification query (run after migration)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'books' AND column_name = 'target_chapters';
