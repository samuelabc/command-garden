// wiz-blog-security.eval.js
// Extracts blog posts from the rendered DOM (Next.js App Router — no __NEXT_DATA__).
// Each post is an <article> with an <h3> title, <time> date, author links, and excerpt.
// NOTE: No IIFE — evaluateInPage wraps this in AsyncFunction already.

const articles = document.querySelectorAll('article');
if (!articles.length) throw new Error('No <article> elements found on page');

return Array.from(articles).map((article) => {
  const h3 = article.querySelector('h3');
  const title = h3 ? h3.textContent.trim() : '';

  // The slug link is the <a> wrapping the <h3>
  const titleLink = h3 ? h3.closest('a') : null;
  const href = titleLink ? titleLink.getAttribute('href') : '';
  const slug = href ? href.replace(/^\/blog\//, '') : '';
  const url = href ? 'https://www.wiz.io' + href : '';

  const timeEl = article.querySelector('time[dateTime]');
  const publishedAt = timeEl ? timeEl.getAttribute('dateTime') : '';

  const excerptEl = article.querySelector('p[class*="line-clamp"]');
  const excerpt = excerptEl ? excerptEl.textContent.trim() : '';

  const authorLinks = article.querySelectorAll('a[href^="/authors/"]');
  const authors = Array.from(authorLinks)
    .map((a) => a.textContent.trim())
    .filter(Boolean)
    .join(', ');

  return { title, slug, url, publishedAt, excerpt, authors, tags: '' };
});
