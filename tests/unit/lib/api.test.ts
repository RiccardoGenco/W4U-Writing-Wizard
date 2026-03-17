import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';

// Mock Supabase library
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      refreshSession: vi.fn().mockResolvedValue({ 
        data: { session: { access_token: 'mock-token' } }, 
        error: null 
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'initial-token' } },
        error: null
      })
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  }))
}));

import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';
import { callBookAgent } from '../../../src/lib/api';

beforeAll(() => {
  server.listen();
  // vi.useFakeTimers();
});
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  // vi.clearAllTimers();
});
afterAll(() => {
  server.close();
  // vi.useRealTimers();
});

describe('callBookAgent logic', () => {
  it('returns data immediately on synchronous response (e.g. OUTLINE)', async () => {
    server.use(
      http.post('/api/ai-agent', () => HttpResponse.json({
        status: 'completed',
        data: { chapters: [{ title: 'Cap 1' }] }
      }))
    );

    const result = await callBookAgent('OUTLINE', {}, 'book-id-123');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe('Cap 1');
  });

  it('refreshes the session if polling returns a 401', async () => {
    let attempt = 0;
    server.use(
      http.post('/api/ai-agent', () => HttpResponse.json({ requestId: 'req-401-refresh' })),
      http.get('/api/ai-agent/status/req-401-refresh', () => {
        if (attempt++ === 0) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ status: 'completed', data: { success: true } });
      })
    );
    
    const result = await callBookAgent('SCAFFOLD_CHAPTER', {}, 'book-id-123');
    expect(result.success).toBe(true);
  }, 30000);
  
  it('throws an error if the request is not found (404)', async () => {
    server.use(
      http.post('/api/ai-agent', () => HttpResponse.json({ requestId: 'req-404' })),
      http.get('/api/ai-agent/status/req-404', () => new HttpResponse(JSON.stringify({ error: 'Not Found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    
    const resultPromise = callBookAgent('SCAFFOLD_CHAPTER', {}, 'book-id-123');
    
    await expect(resultPromise).rejects.toThrow('Request not found');
  });
});
