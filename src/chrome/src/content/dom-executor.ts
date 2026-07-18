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

export function extractHtml(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element "${selector}" not found`);
  return el.innerHTML;
}

export function extractTree(
  rootSelector: string,
  group: { match: string; title: string; children: string },
  leaf: { match: string; fields: Record<string, string> },
  pathSeparator: string,
): Record<string, unknown>[] {
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`Root "${rootSelector}" not found`);

  function extractField(el: Element, spec: string): string {
    if (spec === 'textContent') return el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    if (spec === 'href') return el.getAttribute('href') ?? '';
    if (spec.startsWith('attr:')) return el.getAttribute(spec.slice(5)) ?? '';
    return el.textContent?.trim() ?? '';
  }

  function walk(container: Element, ancestors: string[], depth: number): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    for (const child of Array.from(container.children)) {
      if (child.matches(leaf.match)) {
        const row: Record<string, unknown> = {};
        for (const [name, spec] of Object.entries(leaf.fields)) {
          row[name] = extractField(child, spec);
        }
        const title = (row.title as string) || child.textContent?.trim() || '';
        const section = ancestors.length > 0 ? ancestors[0] : title;
        const pathParts = [...ancestors, title];
        row.section = section;
        row.path = pathParts.join(pathSeparator);
        row.depth = depth;
        results.push(row);
      } else if (child.matches(group.match)) {
        const titleEl = child.querySelector(group.title);
        const groupTitle = titleEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
        const childContainer = child.querySelector(group.children);
        if (childContainer) {
          results.push(...walk(childContainer, [...ancestors, groupTitle], depth + 1));
        }
      } else {
        results.push(...walk(child, ancestors, depth));
      }
    }
    return results;
  }

  return walk(root, [], 0);
}

export async function clickAll(
  selector: string, pause: number, maxRounds: number, settle: number,
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) break;
    for (const el of Array.from(elements)) {
      (el as HTMLElement).click();
      if (pause > 0) await new Promise(r => setTimeout(r, pause));
    }
  }
  if (settle > 0) await new Promise(r => setTimeout(r, settle));
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
