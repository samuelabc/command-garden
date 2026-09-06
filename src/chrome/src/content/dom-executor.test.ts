// @vitest-environment jsdom
// src/content/dom-executor.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitForSelector, extractData, clickElement, clickAll, extractTree, typeIntoElement, fetchFromPage } from './dom-executor.js';

describe('waitForSelector', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('resolves immediately when element exists', async () => {
    document.body.innerHTML = '<div class="target">hello</div>';
    await expect(waitForSelector('.target', 1000)).resolves.toBeUndefined();
  });

  it('rejects on timeout when element missing', async () => {
    await expect(waitForSelector('.missing', 100)).rejects.toThrow('timed out');
  });

  it('resolves when element appears later', async () => {
    setTimeout(() => { document.body.innerHTML = '<div class="later"></div>'; }, 50);
    await expect(waitForSelector('.later', 2000)).resolves.toBeUndefined();
  });
});

describe('extractData', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <table><tbody>
        <tr><td class="name">Alice</td><td class="age">30</td></tr>
        <tr><td class="name">Bob</td><td class="age">25</td></tr>
      </tbody></table>`;
  });

  it('extracts data from matching rows', () => {
    const data = extractData('tbody tr', { name: '.name', age: '.age' });
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ name: 'Alice', age: '30' });
    expect(data[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('returns empty array when no rows match', () => {
    expect(extractData('.missing', { a: 'td' })).toEqual([]);
  });

  it('returns empty string for missing field selector', () => {
    const data = extractData('tbody tr', { name: '.name', email: '.email' });
    expect(data[0].email).toBe('');
  });
});

describe('clickElement', () => {
  it('clicks the element', async () => {
    let clicked = false;
    document.body.innerHTML = '<button id="btn">Click</button>';
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true; });
    await clickElement('#btn');
    expect(clicked).toBe(true);
  });

  it('throws for missing element', async () => {
    document.body.innerHTML = '';
    await expect(clickElement('#missing')).rejects.toThrow('not found');
  });
});

describe('clickAll', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('clicks all matching elements', async () => {
    document.body.innerHTML = `
      <div>
        <button class="expand" aria-expanded="false">A</button>
        <button class="expand" aria-expanded="false">B</button>
      </div>`;
    // Simulate: clicking a button sets aria-expanded to true (removes from selector match)
    document.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => btn.setAttribute('aria-expanded', 'true'));
    });
    await clickAll('button[aria-expanded="false"]', 0, 10, 0);
    const expanded = document.querySelectorAll('button[aria-expanded="true"]');
    expect(expanded).toHaveLength(2);
  });

  it('re-scans and clicks newly revealed elements', async () => {
    // A click on the first button reveals a second button
    document.body.innerHTML = '<div id="root"><button class="toggle">A</button></div>';
    const root = document.getElementById('root')!;
    let round = 0;
    root.querySelector('button')!.addEventListener('click', () => {
      root.querySelector('button')!.remove();
      if (round === 0) {
        const btn2 = document.createElement('button');
        btn2.className = 'toggle';
        btn2.textContent = 'B';
        btn2.addEventListener('click', () => btn2.remove());
        root.appendChild(btn2);
      }
      round++;
    });
    await clickAll('button.toggle', 0, 10, 0);
    expect(document.querySelectorAll('button.toggle')).toHaveLength(0);
  });

  it('stops after maxRounds even if matches remain', async () => {
    // Button keeps matching (never changes on click)
    document.body.innerHTML = '<button class="forever">X</button>';
    let clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => { clicks++; });
    await clickAll('button.forever', 0, 3, 0);
    // Should have clicked at least once per round, but stopped at maxRounds
    expect(clicks).toBeGreaterThanOrEqual(3);
  });

  it('returns immediately when no elements match', async () => {
    document.body.innerHTML = '<div>nothing</div>';
    await clickAll('.missing', 0, 10, 0);
    // No error, just returns
  });
});

describe('extractTree', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('extracts a basic tree with groups and leaves', () => {
    document.body.innerHTML = `
      <nav id="root">
        <div>
          <button>Security</button>
          <div>
            <a href="/docs/edr/">EDR</a>
            <a href="/docs/firewall/">Firewall</a>
          </div>
        </div>
        <div>
          <button>DevOps</button>
          <div>
            <a href="/docs/ci/">CI/CD</a>
          </div>
        </div>
      </nav>`;
    const rows = extractTree(
      '#root',
      { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      { match: 'a', fields: { title: 'textContent', url: 'href' } },
      ' / ',
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      title: 'EDR', url: '/docs/edr/',
      section: 'Security', path: 'Security / EDR', depth: 1,
    });
    expect(rows[2]).toEqual({
      title: 'CI/CD', url: '/docs/ci/',
      section: 'DevOps', path: 'DevOps / CI/CD', depth: 1,
    });
  });

  it('handles nested groups (depth > 1)', () => {
    document.body.innerHTML = `
      <nav id="root">
        <div>
          <button>Top</button>
          <div>
            <div>
              <button>Sub</button>
              <div>
                <a href="/leaf">Leaf</a>
              </div>
            </div>
          </div>
        </div>
      </nav>`;
    const rows = extractTree(
      '#root',
      { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      { match: 'a', fields: { title: 'textContent', url: 'href' } },
      ' / ',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      title: 'Leaf', url: '/leaf',
      section: 'Top', path: 'Top / Sub / Leaf', depth: 2,
    });
  });

  it('passes through wrapper divs transparently', () => {
    document.body.innerHTML = `
      <nav id="root">
        <div class="wrapper">
          <a href="/page">Page</a>
        </div>
      </nav>`;
    const rows = extractTree(
      '#root',
      { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      { match: 'a', fields: { title: 'textContent', url: 'href' } },
      ' / ',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      title: 'Page', url: '/page',
      section: 'Page', path: 'Page', depth: 0,
    });
  });

  it('returns empty array for empty tree', () => {
    document.body.innerHTML = '<nav id="root"></nav>';
    const rows = extractTree(
      '#root',
      { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      { match: 'a', fields: { title: 'textContent' } },
      ' / ',
    );
    expect(rows).toEqual([]);
  });

  it('throws when root selector not found', () => {
    document.body.innerHTML = '<div>nothing</div>';
    expect(() => extractTree(
      '#missing',
      { match: 'div', title: 'button', children: 'div' },
      { match: 'a', fields: { title: 'textContent' } },
      ' / ',
    )).toThrow('not found');
  });

  it('extracts href attribute for url field', () => {
    document.body.innerHTML = `
      <nav id="root">
        <a href="/docs/page">My Page</a>
      </nav>`;
    const rows = extractTree(
      '#root',
      { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      { match: 'a', fields: { title: 'textContent', url: 'href' } },
      ' / ',
    );
    expect(rows[0].url).toBe('/docs/page');
  });
});

describe('typeIntoElement', () => {
  it('sets value on input', async () => {
    document.body.innerHTML = '<input id="inp" />';
    await typeIntoElement('#inp', 'hello');
    expect((document.getElementById('inp') as HTMLInputElement).value).toBe('hello');
  });

  it('throws for missing element', async () => {
    document.body.innerHTML = '';
    await expect(typeIntoElement('#missing', 'x')).rejects.toThrow('not found');
  });
});

describe('fetchFromPage', () => {
  function mockFetch(body: string, contentType: string) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? contentType : null },
      json: () => Promise.resolve(JSON.parse(body)),
      text: () => Promise.resolve(body),
    });
  }

  it('parses response as JSON for application/json', async () => {
    mockFetch('{"items":[1,2]}', 'application/json');
    const result = await fetchFromPage('https://example.com/api');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('parses response as JSON for application/feed+json', async () => {
    mockFetch('{"items":[1,2]}', 'application/feed+json');
    const result = await fetchFromPage('https://example.com/feed.json');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('parses response as JSON for application/vnd.api+json', async () => {
    mockFetch('{"data":[]}', 'application/vnd.api+json');
    const result = await fetchFromPage('https://example.com/api');
    expect(result).toEqual({ data: [] });
  });

  it('returns text for non-JSON content types', async () => {
    mockFetch('<html>hello</html>', 'text/html');
    const result = await fetchFromPage('https://example.com/page');
    expect(result).toBe('<html>hello</html>');
  });
});
