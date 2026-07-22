const tagFilter = '${{ args.tag }}';

const resp = await fetch('https://simonwillison.net/atom/everything/');
if (!resp.ok) throw new Error('Failed to fetch Atom feed: ' + resp.status);

const xml = await resp.text();
const doc = new DOMParser().parseFromString(xml, 'application/xml');

const parserError = doc.querySelector('parsererror');
if (parserError) throw new Error('Atom XML parse error: ' + parserError.textContent);

const ns = 'http://www.w3.org/2005/Atom';
const entries = doc.getElementsByTagNameNS(ns, 'entry');

const rows = [];
for (const entry of entries) {
  const categories = Array.from(entry.getElementsByTagNameNS(ns, 'category'));
  const tags = categories.map(c => c.getAttribute('term')).filter(Boolean).join(', ');

  if (tagFilter && !tags.split(', ').includes(tagFilter)) continue;

  const title = (entry.getElementsByTagNameNS(ns, 'title')[0]?.textContent ?? '').trim();

  const linkEl = Array.from(entry.getElementsByTagNameNS(ns, 'link'))
    .find(l => l.getAttribute('rel') === 'alternate');
  const rawUrl = linkEl?.getAttribute('href') ?? '';
  const url = rawUrl.replace(/#atom-everything$/, '');

  const published = (entry.getElementsByTagNameNS(ns, 'published')[0]?.textContent ?? '').trim();

  const summaryHtml = entry.getElementsByTagNameNS(ns, 'summary')[0]?.textContent ?? '';
  const tmp = document.createElement('div');
  tmp.innerHTML = summaryHtml;
  const summary = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

  rows.push({ title, url, published, summary, tags });
}

return rows;
