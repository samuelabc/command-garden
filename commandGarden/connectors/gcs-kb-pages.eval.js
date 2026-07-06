// Runs in page context via js_evaluate step.
// Extracts the full page index from the GCS Knowledge Base sidebar.
//
// The site is a Next.js/Mintlify docs site behind Mercedes-Benz SSO.
// The sidebar uses <button aria-expanded> for collapsible sections
// and <a href="/gcs/KB/..."> for leaf pages.
//
// Strategy:
//   1. Wait for SSO redirect to land on pages.i.mercedes-benz.com
//   2. Expand every collapsed sidebar section recursively
//   3. Walk the DOM tree to build a flat list of leaf pages
//      with title, url, section (top-level parent), path (breadcrumb), depth

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Wait for SSO redirect (up to 30s) ──────────────────────────────────
const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (location.hostname === 'pages.i.mercedes-benz.com') break;
  await sleep(1000);
}
if (location.hostname !== 'pages.i.mercedes-benz.com') {
  throw new Error('Not signed in — log in at pages.i.mercedes-benz.com and retry');
}

// ── Locate sidebar ─────────────────────────────────────────────────────
const sidebar = document.querySelector('aside') || document.querySelector('[role="complementary"]');
if (!sidebar) throw new Error('Sidebar not found — page structure may have changed');

// ── Expand all collapsed sections recursively ──────────────────────────
const MAX_EXPAND_DEPTH = 10;
async function expandAll(depth) {
  if (depth >= MAX_EXPAND_DEPTH) return;
  const collapsed = sidebar.querySelectorAll('button[aria-expanded="false"]');
  if (collapsed.length === 0) return;
  for (const btn of collapsed) {
    btn.click();
    await sleep(200);
  }
  // Recurse — newly revealed sections may themselves be collapsed
  await expandAll(depth + 1);
}
await expandAll(0);
// Small settle delay for any pending DOM updates
await sleep(300);

// ── Walk the nav tree ──────────────────────────────────────────────────
// The nav container holds the page links and section buttons.
// Primary: find the child that contains a link to the KB home page.
// Fallback: positional sidebar.children[1].
const navContainer = [...sidebar.children].find(
  c => c.querySelector('a[href="/gcs/KB/docs/main/"]')
) || sidebar.children[1];
if (!navContainer) throw new Error('Nav container not found — sidebar structure may have changed');

function walkNode(container, ancestors, depth) {
  const results = [];
  if (!container) return results;

  for (const child of container.children) {
    if (child.tagName === 'A') {
      // Leaf page
      const title = child.textContent.trim().replace(/\s+/g, ' ');
      const href = child.getAttribute('href') || '';
      if (title && href.startsWith('/gcs/KB/')) {
        const section = ancestors.length > 0 ? ancestors[0] : title;
        const pathParts = [...ancestors, title];
        results.push({
          title,
          url: href,
          section,
          path: pathParts.join(' / '),
          depth,
        });
      }
    } else if (child.tagName === 'DIV' || child.tagName === 'SECTION') {
      // Possibly a section wrapper: <div> containing a <button> + child <div>
      const btn = child.querySelector(':scope > button');
      if (btn) {
        const sectionTitle = btn.textContent.trim().replace(/\s+/g, ' ');
        const childContainer = child.querySelector(':scope > div');
        if (childContainer) {
          results.push(...walkNode(childContainer, [...ancestors, sectionTitle], depth + 1));
        }
      } else {
        // Plain wrapper div — recurse without adding depth
        results.push(...walkNode(child, ancestors, depth));
      }
    }
  }
  return results;
}

const rows = walkNode(navContainer, [], 0);

return rows;
