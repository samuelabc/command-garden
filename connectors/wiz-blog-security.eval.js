// wiz-blog-security.eval.js
// Extracts blog posts from Next.js __NEXT_DATA__ embedded JSON.
// Returns an array of flattened post objects for the pipeline.
// NOTE: No IIFE — evaluateInPage wraps this in AsyncFunction already.

const script = document.getElementById('__NEXT_DATA__');
if (!script) throw new Error('__NEXT_DATA__ script tag not found');

const raw = script.textContent;
if (!raw) throw new Error('__NEXT_DATA__ script tag is empty');

const nextData = JSON.parse(raw);
const pageProps = nextData?.props?.pageProps;
if (!pageProps) throw new Error('pageProps not found in __NEXT_DATA__');

const posts = pageProps.initialPosts;
if (!Array.isArray(posts)) throw new Error('initialPosts is not an array');

return posts
  .filter((p) => !p.hiddenFromArchive)
  .map((p) => ({
    title: p.title || '',
    slug: p.slug || '',
    url: 'https://www.wiz.io/blog/' + (p.slug || ''),
    publishedAt: p._firstPublishedAt || '',
    excerpt: p.excerpt || '',
    authors: (p.authors || []).map((a) => a.fullName).join(', '),
    tags: (p.tags || []).map((t) => t.name).join(', '),
  }));
