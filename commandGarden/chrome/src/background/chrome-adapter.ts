// src/background/chrome-adapter.ts
import type { PipelineStep } from '@commandgarden/shared';
import type { ChromeAdapter } from '../pipeline/runner.js';
import { createDomRequest, type DomResponse } from '../messages.js';

export class RealChromeAdapter implements ChromeAdapter {
  private tabId: number | null = null;
  private targetOrigin: string | null = null;

  async navigateTab(url: string): Promise<number> {
    try { this.targetOrigin = new URL(url).origin; } catch { this.targetOrigin = null; }
    if (this.tabId) {
      await chrome.tabs.update(this.tabId, { url, active: true });
    } else {
      const tab = await chrome.tabs.create({ url, active: true });
      this.tabId = tab.id!;
    }
    return this.tabId;
  }

  async waitForTabLoad(tabId: number): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(tabId);
      const onTarget = this.targetOrigin
        ? tab.url?.startsWith(this.targetOrigin)
        : (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:'));
      if (tab.status === 'complete' && onTarget) {
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Tab load timed out — if SSO login is required, log in and retry');
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

  async evaluateInPage(tabId: number, code: string): Promise<unknown> {
    const nonce = '__cg_' + Math.random().toString(36).slice(2);
    // Step 1: inject the async code; it stores result on window when done
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [code, nonce],
      func: (codeStr: string, key: string) => {
        (window as Record<string, unknown>)[key] = { pending: true };
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        new AsyncFunction(codeStr)().then(
          (r: unknown) => { (window as Record<string, unknown>)[key] = { ok: true, result: r }; },
          (e: Error) => { (window as Record<string, unknown>)[key] = { ok: false, error: e.message || String(e) }; },
        );
      },
    });
    // Step 2: poll for the result (long timeout for SSO/MFA flows)
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const [poll] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [nonce],
        func: (key: string) => (window as Record<string, unknown>)[key],
      });
      const val = poll?.result as { pending?: boolean; ok?: boolean; result?: unknown; error?: string } | undefined;
      if (val && !val.pending) {
        // Cleanup
        await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', args: [nonce],
          func: (key: string) => { delete (window as Record<string, unknown>)[key]; },
        });
        if (val.ok) return val.result;
        throw new Error(val.error ?? 'js_evaluate failed');
      }
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('js_evaluate timed out (90s)');
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
