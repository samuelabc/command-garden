// src/content/content-script.ts
import { isDomRequest, createDomResponse, type DomRequest } from '../messages.js';
import { waitForSelector, extractData, clickElement, typeIntoElement, fetchFromPage } from './dom-executor.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isDomRequest(message)) return false;
  const req = message as DomRequest;
  handleRequest(req).then(
    (data) => sendResponse(createDomResponse(req.id, true, data)),
    (err) => sendResponse(createDomResponse(req.id, false, undefined, err.message)),
  );
  return true; // Keep channel open for async response
});

async function handleRequest(req: DomRequest): Promise<unknown> {
  const p = req.params;
  switch (req.action) {
    case 'wait':
      await waitForSelector(p.selector as string, (p.timeout as number) ?? 10000);
      return undefined;
    case 'extract':
      return extractData(p.selector as string, p.fields as Record<string, string>);
    case 'click':
      await clickElement(p.selector as string);
      return undefined;
    case 'type':
      await typeIntoElement(p.selector as string, p.value as string);
      return undefined;
    case 'fetch':
      return fetchFromPage(
        p.url as string, p.method as string,
        p.headers as Record<string, string>, p.body as string,
      );
    default:
      throw new Error(`Unknown action: ${req.action}`);
  }
}
