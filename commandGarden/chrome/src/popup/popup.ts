// src/popup/popup.ts
import type { PopupStatusResponse } from './popup-types.js';
import { timeAgo } from './time-ago.js';

const dot = document.getElementById('dot')!;
const statusText = document.getElementById('status-text')!;
const toggleInput = document.getElementById('toggle-input') as HTMLInputElement;
const activityEl = document.getElementById('activity')!;

let currentEnabled = true;

function render(status: PopupStatusResponse): void {
  currentEnabled = status.enabled;
  toggleInput.checked = status.enabled;

  if (!status.enabled) {
    dot.className = 'dot disabled';
    statusText.textContent = 'Disabled';
  } else if (status.connected) {
    dot.className = 'dot connected';
    statusText.textContent = 'Connected';
  } else {
    dot.className = 'dot disconnected';
    statusText.textContent = 'Disconnected';
  }

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

toggleInput.addEventListener('change', () => {
  const newEnabled = toggleInput.checked;
  toggleInput.disabled = true;
  chrome.runtime.sendMessage({ type: 'setEnabled', enabled: newEnabled }, (response: PopupStatusResponse) => {
    toggleInput.disabled = false;
    if (chrome.runtime.lastError) {
      toggleInput.checked = currentEnabled;
      return;
    }
    render(response);
  });
});

fetchStatus();
