import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealChromeAdapter } from './chrome-adapter.js';

function stubChrome(finalUrl: string): void {
  vi.stubGlobal('chrome', {
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 7 }),
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ status: 'complete', url: finalUrl }),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RealChromeAdapter redirects', () => {
  it.each([
    'https://outlook.cloud.microsoft/calendar/deeplink/compose',
    'https://outlook.cloud.microsoft.mcas.ms/calendar/deeplink/compose',
    'https://mcas-proxyweb.mcas.ms/path',
  ])('accepts a completed load on declared domain %s', async (finalUrl) => {
    stubChrome(finalUrl);
    const adapter = new RealChromeAdapter();

    const tabId = await adapter.navigateTab(
      'https://outlook.cloud.microsoft/calendar/deeplink/compose',
    );
    await adapter.waitForTabLoad(tabId, [
      'outlook.cloud.microsoft',
      'outlook.cloud.microsoft.mcas.ms',
      'mcas-proxyweb.mcas.ms',
    ]);

    expect(tabId).toBe(7);
    expect(chrome.tabs.get).toHaveBeenCalledWith(7);
  });
});
