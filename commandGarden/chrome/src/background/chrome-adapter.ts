// src/background/chrome-adapter.ts
import type { PipelineStep } from '@commandgarden/shared';
import type { ChromeAdapter } from '../pipeline/runner.js';
import { createDomRequest, type DomResponse } from '../messages.js';

export interface AdapterOptions {
  useCdp?: boolean;
}

export class RealChromeAdapter implements ChromeAdapter {
  private tabId: number | null = null;
  private targetOrigin: string | null = null;
  private debuggerAttached = false;
  private readonly useCdp: boolean;

  constructor(options?: AdapterOptions) {
    this.useCdp = options?.useCdp ?? false;
  }
  private cdpEventHandler: ((
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object,
  ) => void) | null = null;

  async navigateTab(url: string): Promise<number> {
    try { this.targetOrigin = new URL(url).origin; } catch { this.targetOrigin = null; }
    if (this.tabId) {
      if (this.useCdp) await this.attachDebugger(this.tabId);
      await chrome.tabs.update(this.tabId, { url, active: true });
    } else {
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      this.tabId = tab.id!;
      if (this.useCdp) await this.attachDebugger(this.tabId);
      await chrome.tabs.update(this.tabId, { url, active: true });
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
        // Attach to the Service Worker target to capture its network events
        if (this.useCdp) await this.attachToServiceWorker();
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Tab load timed out — if SSO login is required, log in and retry');
  }

  private async attachDebugger(tabId: number): Promise<void> {
    if (this.debuggerAttached) return;
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      this.debuggerAttached = true;
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      // Fetch.enable intercepts at the network stack level — captures
      // requests even when a Service Worker mediates them.
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: [
          { urlPattern: '*graphql*', requestStage: 'Response' },
          { urlPattern: '*_apis/*', requestStage: 'Response' },
        ],
      }).catch(() => {});
      this.startCapture(tabId);
    } catch (_e) {
      // Debugger may fail (e.g. another debugger attached, or user dismissed).
      // Fall back to running without CDP — window.fetch interception may
      // miss Service Worker-handled requests.
      this.debuggerAttached = false;
    }
  }

  /**
   * Find and attach to the Service Worker target for the target origin.
   * SW network events are on a separate CDP target — the tab's Network
   * domain doesn't see them. Must be called AFTER the page has loaded
   * (so the SW is registered).
   */
  private async attachToServiceWorker(): Promise<void> {
    if (!this.targetOrigin) return;
    try {
      const targets = await chrome.debugger.getTargets();
      const swTarget = targets.find(t =>
        t.type === 'service_worker' && t.url.startsWith(this.targetOrigin!),
      );
      if (!swTarget?.id) return;

      await chrome.debugger.attach({ targetId: swTarget.id }, '1.3');
      await chrome.debugger.sendCommand({ targetId: swTarget.id }, 'Network.enable');
      // Also enable Fetch domain on SW target
      await chrome.debugger.sendCommand({ targetId: swTarget.id }, 'Fetch.enable', {
        patterns: [
          { urlPattern: '*graphql*', requestStage: 'Response' },
          { urlPattern: '*_apis/*', requestStage: 'Response' },
        ],
      }).catch(() => {});

      const captureTabId = this.tabId;
      const swId = swTarget.id;
      const swDebuggee = { targetId: swId };
      const handler = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
        if (!('targetId' in source) || source.targetId !== swId) return;
        if (!captureTabId) return;

        if (method === 'Fetch.requestPaused') {
          const p = params as { requestId: string };
          this.handleGraphqlResponse(swDebuggee, captureTabId, p.requestId, true);
          return;
        }

        if (method === 'Network.responseReceived') {
          const p = params as { requestId: string; response: { url: string } };
          if (!p.response.url.includes('graphql')) return;
          this.handleGraphqlResponse(swDebuggee, captureTabId, p.requestId, false);
        }
      };

      const origHandler = this.cdpEventHandler;
      this.cdpEventHandler = (source, method, params) => {
        if (origHandler) origHandler(source, method, params);
        handler(source, method, params);
      };
      if (origHandler) chrome.debugger.onEvent.removeListener(origHandler);
      chrome.debugger.onEvent.addListener(this.cdpEventHandler);

      this._swTargetId = swTarget.id;
    } catch (_e) {
      // SW may not be available — fall back silently
    }
  }

  private _swTargetId: string | null = null;

  /** Inject an ADO API response body into the page's globalThis.__cdpCapture array.
   *  Used by ado/git-commits and similar connectors that need CDP-intercepted data. */
  private injectCdpCapture(tabId: number, body: string): void {
    chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', args: [body],
      func: (data: string) => {
        if (!(globalThis as Record<string, unknown>).__cdpCapture) (globalThis as Record<string, unknown>).__cdpCapture = [];
        ((globalThis as Record<string, unknown>).__cdpCapture as string[]).push(data);
      },
    });
  }

  /** Inject a getSchedule response body into the page's globalThis.__rfb array. */
  private injectRfb(tabId: number, body: string): void {
    chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', args: [body],
      func: (data: string) => {
        if (!(globalThis as Record<string, unknown>).__rfb) (globalThis as Record<string, unknown>).__rfb = [];
        ((globalThis as Record<string, unknown>).__rfb as Array<{ req: string; body: string }>).push({ req: '', body: data });
      },
    });
  }

  /**
   * Handle a CDP graphql response: decode, check for getSchedule, inject into __rfb.
   * For Fetch domain responses, also calls Fetch.continueRequest in .finally().
   */
  private handleGraphqlResponse(
    debuggee: chrome.debugger.Debuggee,
    tabId: number,
    requestId: string,
    isFetchDomain: boolean,
  ): void {
    const cmd = isFetchDomain ? 'Fetch.getResponseBody' : 'Network.getResponseBody';
    chrome.debugger.sendCommand(debuggee, cmd, { requestId }).then((result) => {
      const raw = result as { body: string; base64Encoded: boolean };
      const body = isFetchDomain && raw.base64Encoded ? atob(raw.body) : (raw.body || '');
      // Inject getSchedule responses into __rfb (room-availability / outlook)
      if (body.includes('getSchedule') && body.includes('availabilityView')) {
        this.injectRfb(tabId, body);
      }
      // Inject ADO API responses into __cdpCapture (git-commits / work items)
      if (body.includes('commitId') || body.includes('pushId') || body.includes('workItems')) {
        this.injectCdpCapture(tabId, body);
      }
    }).catch(() => {}).finally(() => {
      if (isFetchDomain) {
        chrome.debugger.sendCommand(debuggee, 'Fetch.continueRequest', { requestId }).catch(() => {});
      }
    });
  }

  /**
   * Primary capture via Fetch.requestPaused (intercepts at network stack level,
   * works across SW boundaries). Falls back to Network.responseReceived.
   */
  private startCapture(tabId: number): void {
    this.cdpEventHandler = (source, method, params) => {
      if (source.tabId !== tabId) return;

      // ── Fetch.requestPaused — primary capture path ──
      if (method === 'Fetch.requestPaused') {
        const p = params as { requestId: string };
        this.handleGraphqlResponse({ tabId }, tabId, p.requestId, true);
        return;
      }

      // ── Network.responseReceived — fallback capture path ──
      if (method === 'Network.responseReceived') {
        const p = params as { requestId: string; response: { url: string } };
        if (!p.response.url.includes('graphql')) return;
        this.handleGraphqlResponse({ tabId }, tabId, p.requestId, false);
      }
    };
    chrome.debugger.onEvent.addListener(this.cdpEventHandler);
  }

  async executeInContent(tabId: number, step: PipelineStep): Promise<unknown> {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });

    const action = step.step as 'wait' | 'extract' | 'extract_tree' | 'extract_html' | 'click' | 'click_all' | 'type' | 'fetch';
    const req = createDomRequest(action, step as unknown as Record<string, unknown>);
    const response = await chrome.tabs.sendMessage(tabId, req) as DomResponse;
    if (!response.ok) throw new Error(response.error ?? 'Content script error');
    return response.data;
  }

  /**
   * Run eval.js code via CDP Runtime.evaluate — bypasses CSP because it
   * executes at the debugger level (like typing in DevTools console).
   * Required for sites like ADO that use strict-dynamic CSP with nonces,
   * which blocks new AsyncFunction() / eval() from chrome.scripting.
   */
  private async evaluateViaCdp(tabId: number, code: string): Promise<unknown> {
    // Wrap in async IIFE so eval.js `return` statements work correctly.
    // Race against a 90s timeout since Runtime.evaluate with awaitPromise
    // will wait indefinitely otherwise.
    const expression = `
      Promise.race([
        (async () => { ${code} })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('js_evaluate timed out (90s)')), 90000))
      ])
    `;
    const result = await chrome.debugger.sendCommand(
      { tabId }, 'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
    );
    const r = result as {
      result?: { type: string; value?: unknown; description?: string };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (r.exceptionDetails) {
      const errMsg = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
      throw new Error(errMsg);
    }
    return r.result?.value;
  }

  async evaluateInPage(tabId: number, code: string): Promise<unknown> {
    // When the debugger is attached, use CDP Runtime.evaluate to bypass
    // the page's CSP (ADO's strict-dynamic CSP blocks AsyncFunction).
    if (this.debuggerAttached) {
      return this.evaluateViaCdp(tabId, code);
    }

    const nonce = '__cg_' + Math.random().toString(36).slice(2);
    // Step 1: inject the async code; it stores result on globalThis when done.
    // try-catch inside the func ensures CSP rejections (which throw
    // synchronously from the AsyncFunction constructor) are captured
    // as {ok:false} instead of leaving the nonce stuck at {pending:true}.
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [code, nonce],
      func: (codeStr: string, key: string) => {
        (globalThis as Record<string, unknown>)[key] = { pending: true };
        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          new AsyncFunction(codeStr)().then(
            (r: unknown) => { (globalThis as Record<string, unknown>)[key] = { ok: true, result: r }; },
            (e: Error) => { (globalThis as Record<string, unknown>)[key] = { ok: false, error: e.message || String(e) }; },
          );
        } catch (syncErr: unknown) {
          // CSP or other sync error creating/invoking the AsyncFunction
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          (globalThis as Record<string, unknown>)[key] = { ok: false, error: '[sync] ' + msg };
        }
      },
    });
    // Step 2: poll for the result (long timeout for SSO/MFA flows and multi-room checks)
    const deadline = Date.now() + 280000;
    while (Date.now() < deadline) {
      const [poll] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [nonce],
        func: (key: string) => (globalThis as Record<string, unknown>)[key],
      });
      const val = poll?.result as { pending?: boolean; ok?: boolean; result?: unknown; error?: string } | undefined;
      if (val && !val.pending) {
        // Cleanup
        await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', args: [nonce],
          func: (key: string) => { delete (globalThis as Record<string, unknown>)[key]; },
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
    if (this.cdpEventHandler) {
      chrome.debugger.onEvent.removeListener(this.cdpEventHandler);
      this.cdpEventHandler = null;
    }
    if (this._swTargetId) {
      chrome.debugger.detach({ targetId: this._swTargetId }).catch(() => {});
      this._swTargetId = null;
    }
    if (this.debuggerAttached && this.tabId) {
      chrome.debugger.detach({ tabId: this.tabId }).catch(() => {});
      this.debuggerAttached = false;
    }
    if (this.tabId) {
      chrome.tabs.remove(this.tabId).catch(() => {});
      this.tabId = null;
    }
  }
}
