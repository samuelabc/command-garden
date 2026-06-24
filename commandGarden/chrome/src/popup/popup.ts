// src/popup/popup.ts
import type { PopupStatusResponse } from './popup-types.js';
import { timeAgo } from './time-ago.js';

const dot = document.getElementById('dot')!;
const statusText = document.getElementById('status-text')!;
const reconnectBtn = document.getElementById('reconnect-btn') as HTMLButtonElement;
const activityEl = document.getElementById('activity')!;

function render(status: PopupStatusResponse): void {
  dot.className = `dot ${status.connected ? 'connected' : 'disconnected'}`;
  statusText.textContent = status.connected ? 'Connected' : 'Disconnected';
  reconnectBtn.style.display = status.connected ? 'none' : '';

  if (status.recentActivity.length === 0) {
    activityEl.innerHTML = '<div class="empty">No recent activity</div>';
    return;
  }

  const now = Date.now();
  activityEl.innerHTML = status.recentActivity
    .map(entry => {
      const icon = entry.ok
        ? '<span class="activity-icon ok">✓</span>'
        : '<span class="activity-icon fail">✗</span>';
      return `<div class="activity-item">${icon}<span class="activity-name">${escapeHtml(entry.connector)}</span><span class="activity-time">${timeAgo(entry.timestamp, now)}</span></div>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function fetchStatus(): void {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response: PopupStatusResponse) => {
    if (chrome.runtime.lastError) {
      statusText.textContent = 'Error';
      return;
    }
    render(response);
  });
}

reconnectBtn.addEventListener('click', () => {
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = 'Reconnecting…';
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(() => {
      reconnectBtn.disabled = false;
      reconnectBtn.textContent = 'Reconnect';
      fetchStatus();
    }, 1000);
  });
});

fetchStatus();
