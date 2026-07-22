// every-newsletter.eval.js
// Extracts blog posts from Every's newsletter page.
// Strategy: try __NEXT_DATA__ first, fall back to DOM scraping.
// NOTE: No IIFE — evaluateInPage wraps this in AsyncFunction already.

function extractFromNextData() {
  const script = document.getElementById('__NEXT_DATA__');
  if (!script) return null;

  const raw = script.textContent;
  if (!raw) return null;

  const nextData = JSON.parse(raw);
  const pageProps = nextData?.props?.pageProps;
  if (!pageProps) return null;

  const posts = pageProps.posts || pageProps.initialPosts || pageProps.articles || pageProps.items;
  if (!Array.isArray(posts) || posts.length === 0) return null;

  return posts.map((p) => ({
    title: p.title || p.headline || '',
    url: p.url || p.canonical_url || (p.slug ? 'https://every.to/p/' + p.slug : ''),
    published: p.published_at || p.publishedAt || p._firstPublishedAt || p.date || '',
    author:
      (p.authors || []).map((a) => a.name || a.fullName || a.full_name || '').join(', ') ||
      p.author?.name ||
      p.author ||
      '',
    summary: (p.subtitle || p.excerpt || p.description || p.summary || '').slice(0, 300),
  }));
}

function extractFromDOM() {
  const links = document.querySelectorAll('a[href*="/p/"], a[href*="/chain-of-thought/"], a[href*="/context-window/"], a[href*="/source-code/"], a[href*="/working-overtime/"], a[href*="/vibe-check/"], a[href*="/thesis/"], a[href*="/also-true-for-humans/"], a[href*="/on-every/"]');
  if (!links.length) throw new Error('No post links found on page — site structure may have changed');

  const seen = new Set();
  const rows = [];

  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href || seen.has(href)) continue;

    const titleEl = link.querySelector('h2, h3, [class*="title"], [class*="Title"]');
    if (!titleEl) continue;

    const title = titleEl.textContent.trim();
    if (!title) continue;
    seen.add(href);

    const url = href.startsWith('http') ? href : 'https://every.to' + href;

    const card = link.closest('article') || link.parentElement?.closest('div') || link.parentElement;

    let published = '';
    const timeEl = card?.querySelector('time');
    if (timeEl) {
      published = timeEl.getAttribute('datetime') || timeEl.textContent.trim();
    }
    if (!published) {
      const dateMatch = card?.textContent?.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/);
      if (dateMatch) published = dateMatch[0];
    }

    let author = '';
    const authorLink = card?.querySelector('a[href*="/@"]');
    if (authorLink) {
      author = authorLink.textContent.trim();
    }

    let summary = '';
    const subtitleEl = link.querySelector('p, [class*="subtitle"], [class*="Subtitle"], [class*="description"]');
    if (subtitleEl) {
      summary = subtitleEl.textContent.trim().slice(0, 300);
    }

    rows.push({ title, url, published, author, summary });
  }

  if (!rows.length) throw new Error('Could not extract posts from DOM — site structure may have changed');
  return rows;
}

const nextDataRows = extractFromNextData();
if (nextDataRows) return nextDataRows;

return extractFromDOM();
