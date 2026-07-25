const tagFilter = '${{ args.tag }}';

const resp = await fetch('https://blog.trailofbits.com/index.xml');
if (!resp.ok) throw new Error('Failed to fetch RSS feed: ' + resp.status);

const xml = await resp.text();
const doc = new DOMParser().parseFromString(xml, 'application/xml');

const parserError = doc.querySelector('parsererror');
if (parserError) throw new Error('RSS XML parse error: ' + parserError.textContent);

const items = doc.querySelectorAll('item');

const rows = [];
for (const item of items) {
  const categories = Array.from(item.querySelectorAll('category'));
  const tags = categories.map(c => (c.textContent || '').trim()).filter(Boolean).join(', ');

  if (tagFilter && !tags.toLowerCase().split(', ').some(t => t === tagFilter.toLowerCase())) continue;

  const title = (item.querySelector('title')?.textContent ?? '').trim();
  const url = (item.querySelector('link')?.textContent ?? '').trim();
  const published = (item.querySelector('pubDate')?.textContent ?? '').trim();

  const descHtml = item.querySelector('description')?.textContent ?? '';
  const tmp = document.createElement('div');
  tmp.innerHTML = descHtml;
  const summary = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

  rows.push({ title, url, published, summary, tags });
}

return rows;
