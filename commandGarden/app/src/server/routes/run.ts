import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function runRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.post('/api/run', async (req, reply) => {
    try {
      return await daemon.post('/api/run', req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.code(502).send({ ok: false, error: message });
    }
  });

  app.post('/api/approval', async (req, reply) => {
    try {
      return await daemon.post('/api/approval', req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.code(502).send({ ok: false, error: message });
    }
  });

  app.get('/api/run/events/:requestId', async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    try {
      const resp = await daemon.pipeRaw(`/api/run/events/${requestId}`);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
        reply.raw.end();
      };
      pump().catch(() => reply.raw.end());
      req.raw.on('close', () => reader.cancel());
    } catch {
      reply.code(502).send({ ok: false, error: 'Failed to connect to daemon SSE' });
    }
  });
}
