import { http, HttpResponse } from 'msw';

export const handlers = [
  // Intercepting N8N webhook
  http.post('/api/ai-agent', async ({ request }) => {
    // Basic mock for successful job initiation
    return HttpResponse.json({
      status: 'completed',
      data: { paragraphs: [{ title: 'Scena 1', description: 'Intro' }] }
    });
  }),

  // Intercepting polling status
  http.get('/api/ai-agent/status/:requestId', () => {
    return HttpResponse.json({ status: 'completed', data: { chapters: [] } });
  }),
];
