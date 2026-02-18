-- Migration: Create ai_requests table for async job tracking
-- Created: 2026-02-18
-- Purpose: Support async polling pattern to avoid Vercel timeouts

CREATE TABLE IF NOT EXISTS ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  book_id UUID REFERENCES books(id),
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  request_payload JSONB,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id ON ai_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status ON ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_book_id ON ai_requests(book_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at DESC);

-- RLS policies
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own requests"
  ON ai_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own requests"
  ON ai_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update (for n8n)
CREATE POLICY "Service role can update requests"
  ON ai_requests FOR UPDATE
  USING (true);

-- Verification query
-- SELECT * FROM ai_requests ORDER BY created_at DESC LIMIT 10;
