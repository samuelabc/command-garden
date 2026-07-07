// tldrsec-newsletter.eval.js
// Extracts newsletter posts from Remix's __remixContext embedded JSON.
// Returns an array of flattened post objects for the pipeline.
// NOTE: No IIFE — evaluateInPage wraps this in AsyncFunction already.

const ctx = window.__remixContext;
if (!ctx) throw new Error('__remixContext not found');

const loaderData = ctx.state?.loaderData;
if (!loaderData) throw new Error('loaderData not found in __remixContext');

// The route key for the tag/category page
const categoryData = loaderData['routes/t/$category'];
if (!categoryData) throw new Error('routes/t/$category loader data not found');

const posts = categoryData.paginatedPosts?.posts;
if (!Array.isArray(posts)) throw new Error('paginatedPosts.posts is not an array');

return posts.map((p) => ({
  title: p.web_title || p.meta_default_title || '',
  slug: p.slug || '',
  url: 'https://tldrsec.com/p/' + (p.slug || ''),
  publishedAt: p.override_scheduled_at || p.created_at || '',
  excerpt: p.web_subtitle || p.meta_default_description || '',
  authors: (p.authors || []).map((a) => a.name).join(', '),
  tags: (p.content_tags || []).map((t) => t.display).join(', '),
}));
