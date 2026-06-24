// src/content/dom-executor.ts

export function waitForSelector(selector: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) { resolve(); return; }
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (document.querySelector(selector)) { clearInterval(timer); resolve(); return; }
      elapsed += interval;
      if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error(`Selector "${selector}" timed out after ${timeout}ms`));
      }
    }, interval);
  });
}

export function extractData(
  rowSelector: string,
  fields: Record<string, string>,
): Record<string, string>[] {
  const rows = document.querySelectorAll(rowSelector);
  return Array.from(rows).map(row => {
    const record: Record<string, string> = {};
    for (const [name, selector] of Object.entries(fields)) {
      record[name] = row.querySelector(selector)?.textContent?.trim() ?? '';
    }
    return record;
  });
}

export async function clickElement(selector: string): Promise<void> {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element "${selector}" not found`);
  (el as HTMLElement).click();
}

export async function typeIntoElement(selector: string, value: string): Promise<void> {
  const el = document.querySelector(selector) as HTMLInputElement | null;
  if (!el) throw new Error(`Element "${selector}" not found`);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function evaluateInMainWorld(code: string, timeout = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const nonce = '__cg_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('js_evaluate timed out'));
    }, timeout);

    function handler(event: MessageEvent) {
      if (event.source !== window || event.data?.nonce !== nonce) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.result);
      }
    }
    window.addEventListener('message', handler);

    const script = document.createElement('script');
    script.textContent = `(async()=>{try{const __fn=new Function('return (async()=>{'+${JSON.stringify(code)}+'})()');const __r=await __fn();window.postMessage({nonce:${JSON.stringify(nonce)},result:__r},'*')}catch(__e){window.postMessage({nonce:${JSON.stringify(nonce)},error:__e.message||String(__e)},'*')}})()`;
    document.documentElement.appendChild(script);
    script.remove();
  });
}

export async function fetchFromPage(
  url: string, method = 'GET', headers?: Record<string, string>, body?: string,
): Promise<unknown> {
  const resp = await fetch(url, {
    method, headers, body, credentials: 'include',
  });
  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return resp.json();
  return resp.text();
}
