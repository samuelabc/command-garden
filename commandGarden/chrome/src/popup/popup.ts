// src/popup/popup.ts
/// <reference lib="dom" />
import type { PopupStatusResponse, ApprovalInfo } from './popup-types.js';
import { timeAgo } from './time-ago.js';

const dot = document.getElementById('dot')!;
const statusText = document.getElementById('status-text')!;
const toggleInput = document.getElementById('toggle-input') as HTMLInputElement;
const activityEl = document.getElementById('activity')!;
const approvalsEl = document.getElementById('approvals')!;

let currentEnabled = true;

function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function renderApprovals(approvals: ApprovalInfo[]): void {
  if (approvals.length === 0) {
    approvalsEl.innerHTML = '';
    return;
  }

  const cards = approvals.map(a =>
    `<div class="approval-card" data-id="${escapeHtml(a.approvalId)}">
      <div class="approval-connector">${escapeHtml(a.connectorKey)}</div>
      <div class="approval-detail">Step ${a.stepIndex + 1} [${escapeHtml(a.stepType)}] <span class="approval-cap">${escapeHtml(a.capability)}</span></div>
      <div class="approval-actions">
        <button class="btn-approve" data-approval-id="${escapeHtml(a.approvalId)}" data-approved="true">Approve</button>
        <button class="btn-reject" data-approval-id="${escapeHtml(a.approvalId)}" data-approved="false">Reject</button>
      </div>
    </div>`
  ).join('');

  approvalsEl.innerHTML =
    `<div class="approval-section">
      <div class="approval-header">Pending approvals <span class="approval-count">${approvals.length}</span></div>
      ${cards}
    </div>`;

  approvalsEl.querySelectorAll('[data-approval-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const approvalId = (btn as HTMLElement).dataset.approvalId!;
      const approved = (btn as HTMLElement).dataset.approved === 'true';
      (btn as HTMLButtonElement).disabled = true;
      chrome.runtime.sendMessage(
        { type: 'approvalDecision', approvalId, approved },
        () => { fetchStatus(); },
      );
    });
  });
}

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

  renderApprovals(status.pendingApprovals ?? []);

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

// Listen for push updates from the service worker (approval state changes)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'approvalUpdate') {
    renderApprovals(msg.pendingApprovals ?? []);
  }
});

fetchStatus();
