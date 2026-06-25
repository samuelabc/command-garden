// src/background/service-worker.ts
import type { ExtensionRequest } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';
import type { ActivityEntry, PopupMessage } from '../popup/popup-types.js';
import { initFromStorage, handleSetEnabled, buildStatusResponse } from './service-worker-logic.js';

const DAEMON_URL = 'ws://127.0.0.1:19825/ws/extension';
const client = new WsClient(DAEMON_URL);
const MAX_ACTIVITY = 10;
const recentActivity: ActivityEntry[] = [];

client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const runner = new PipelineRunner(adapter);
  let ok = false;
  try {
    const result = await runner.run(request.connector, request.args);
    ok = result.ok;
    client.sendResponse({ ...result, id: request.id });
  } catch (err) {
    client.sendResponse({
      id: request.id, ok: false, data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    adapter.cleanup();
    recentActivity.unshift({
      connector: `${request.connector.site}/${request.connector.name}`,
      ok,
      timestamp: Date.now(),
    });
    if (recentActivity.length > MAX_ACTIVITY) recentActivity.length = MAX_ACTIVITY;
  }
});

const storageGet = chrome.storage.local.get.bind(chrome.storage.local);
const storageSet = chrome.storage.local.set.bind(chrome.storage.local);

chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse) => {
    if (message.type === 'getStatus') {
      buildStatusResponse(client, storageGet, recentActivity, sendResponse);
    } else if (message.type === 'reconnect') {
      client.disconnect();
      client.connect();
      sendResponse({ ok: true });
    } else if (message.type === 'setEnabled') {
      handleSetEnabled(message.enabled, client, storageSet, sendResponse, recentActivity);
    }
    return true;
  },
);

initFromStorage(storageGet, client);
console.log('commandGarden service worker started');
