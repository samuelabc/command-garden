// src/background/chrome-adapter.ts
import type { PipelineStep } from '@commandgarden/shared';
import type { ChromeAdapter } from '../pipeline/runner.js';
import { createDomRequest, type DomResponse } from '../messages.js';

export class RealChromeAdapter implements ChromeAdapter {
  private tabId: number | null = null;

  async navigateTab(url: string): Promise<number> {
    if (this.tabId) {
      await chrome.tabs.update(this.tabId, { url });
    } else {
      const tab = await chrome.tabs.create({ url, active: false });
      this.tabId = tab.id!;
    }
    return this.tabId;
  }

  async waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Check if already complete
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
  }

  async executeInContent(tabId: number, step: PipelineStep): Promise<unknown> {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });

    const action = step.step as 'wait' | 'extract' | 'click' | 'type' | 'fetch';
    const req = createDomRequest(action, step as unknown as Record<string, unknown>);
    const response = await chrome.tabs.sendMessage(tabId, req) as DomResponse;
    if (!response.ok) throw new Error(response.error ?? 'Content script error');
    return response.data;
  }

  async getCookies(domain: string): Promise<Record<string, string>> {
    const cookies = await chrome.cookies.getAll({ domain });
    const result: Record<string, string> = {};
    for (const c of cookies) result[c.name] = c.value;
    return result;
  }

  cleanup(): void {
    if (this.tabId) {
      chrome.tabs.remove(this.tabId).catch(() => {});
      this.tabId = null;
    }
  }
}
