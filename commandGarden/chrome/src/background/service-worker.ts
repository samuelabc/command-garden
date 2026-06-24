// src/background/service-worker.ts
import type { ExtensionRequest } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';

const DAEMON_URL = 'ws://127.0.0.1:19825/ws/extension';
const client = new WsClient(DAEMON_URL);

client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const runner = new PipelineRunner(adapter);
  try {
    const result = await runner.run(request.connector, request.args);
    client.sendResponse({ ...result, id: request.id });
  } catch (err) {
    client.sendResponse({
      id: request.id, ok: false, data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    adapter.cleanup();
  }
});

client.connect();
console.log('commandGarden service worker started');
