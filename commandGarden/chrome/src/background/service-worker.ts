// src/background/service-worker.ts
declare function setTimeout(cb: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
import type { ExtensionRequest, ApprovalRequest, ApprovalResponse } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import type { ApprovalGate } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';
import type { ActivityEntry, ApprovalInfo, PopupMessage } from '../popup/popup-types.js';
import { initFromStorage, handleSetEnabled, buildStatusResponse } from './service-worker-logic.js';

const DAEMON_URL = 'ws://127.0.0.1:19825/ws/extension';
const client = new WsClient(DAEMON_URL);
const MAX_ACTIVITY = 10;
const recentActivity: ActivityEntry[] = [];

// Pending approval promises keyed by approvalId
const pendingApprovalResolvers = new Map<string, (approved: boolean) => void>();
// Approval info for the popup UI
const pendingApprovalInfos = new Map<string, ApprovalInfo>();

function updateBadge(): void {
  const count = pendingApprovalInfos.size;
  if (count > 0) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function resolveApproval(approvalId: string, approved: boolean): void {
  const resolve = pendingApprovalResolvers.get(approvalId);
  if (resolve) {
    pendingApprovalResolvers.delete(approvalId);
    pendingApprovalInfos.delete(approvalId);
    resolve(approved);
    updateBadge();
    broadcastApprovalUpdate();
  }
}

function getPendingApprovalsList(): ApprovalInfo[] {
  return Array.from(pendingApprovalInfos.values());
}

function broadcastApprovalUpdate(): void {
  chrome.runtime.sendMessage(
    { type: 'approvalUpdate', pendingApprovals: getPendingApprovalsList() },
  ).catch(() => { /* popup may not be open */ });
}

// Handle approval responses from daemon (user approved/rejected via CLI)
client.onApprovalResponse((response: ApprovalResponse) => {
  resolveApproval(response.approvalId, response.approved);
});

function createApprovalGate(requestId: string, connectorKey: string, timeoutMs: number): ApprovalGate {
  return async (stepType, stepIndex, capability, description) => {
    const approvalId = `${requestId}-step-${stepIndex}`;

    // Store info for popup
    pendingApprovalInfos.set(approvalId, {
      approvalId, connectorKey, stepIndex, stepType, capability,
    });
    updateBadge();
    broadcastApprovalUpdate();

    // Send approval request to daemon (which fans it out to CLI via SSE)
    const approvalRequest: ApprovalRequest = {
      type: 'approval.request',
      approvalId,
      requestId,
      connectorKey,
      stepIndex,
      stepType,
      capability,
      description,
    };
    client.sendApprovalRequest(approvalRequest);

    // Wait for either CLI or popup to resolve, with safety-net timeout
    // (daemon normally resolves first; this catches lost WS messages)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolveApproval(approvalId, false);
      }, timeoutMs + 5_000);
      pendingApprovalResolvers.set(approvalId, (approved) => {
        clearTimeout(timer);
        resolve(approved);
      });
    });
  };
}

client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const connectorKey = `${request.connector.site}/${request.connector.name}`;
  const approvalGate = request.approvalConfig
    ? createApprovalGate(request.id, connectorKey, request.approvalConfig.approvalTimeoutMs)
    : undefined;
  const runner = new PipelineRunner(adapter, approvalGate, request.approvalConfig, connectorKey);
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
      connector: connectorKey,
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
      buildStatusResponse(client, storageGet, recentActivity, sendResponse, getPendingApprovalsList());
    } else if (message.type === 'reconnect') {
      client.disconnect();
      client.connect();
      sendResponse({ ok: true });
    } else if (message.type === 'setEnabled') {
      handleSetEnabled(message.enabled, client, storageSet, sendResponse, recentActivity, getPendingApprovalsList());
    } else if (message.type === 'approvalDecision') {
      resolveApproval(message.approvalId, message.approved);
      // Notify daemon so it can resolve its pending approval
      client.sendApprovalResponse({
        type: 'approval.response',
        approvalId: message.approvalId,
        approved: message.approved,
      });
      sendResponse({ ok: true });
    }
    return true;
  },
);

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive' && !client.isConnected()) client.connect();
});

if (chrome.idle?.onStateChanged?.addListener) {
  chrome.idle.onStateChanged.addListener((newState) => {
    if (newState === 'active' && !client.isConnected()) client.connect();
  });
}

chrome.runtime.onStartup.addListener(() => {
  initFromStorage(storageGet, client);
});

initFromStorage(storageGet, client);
console.log('commandGarden service worker started');
