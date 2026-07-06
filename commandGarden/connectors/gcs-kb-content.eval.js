// Runs in page context via js_evaluate step.
// Extracts a single GCS Knowledge Base page and converts it to Markdown.
//
// The site is a Next.js/Mintlify docs site behind Mercedes-Benz SSO.
// Content lives inside an <article> element with rich HTML (headings,
// code blocks, tables, lists, images).
//
// Template variables interpolated before execution:
//   ${{ args.path }}

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

// Wait for article to render
const artDeadline = Date.now() + 15000;
while (Date.now() < artDeadline) {
  if (document.querySelector('article')) break;
  await sleep(500);
}

const article = document.querySelector('article');
if (!article) throw new Error('No <article> element found — page may not have loaded');

// ── Extract metadata ───────────────────────────────────────────────────
const h1 = article.querySelector('h1');
const title = h1 ? h1.textContent.trim() : document.title;

let author = '';
let lastUpdated = '';
// Metadata lives in a <span class="inline-flex ..."> pill with format:
//   "Author Name (ID)|Mon DD, YYYY"
const metaPill = article.querySelector('span.inline-flex');
if (metaPill) {
  const pillText = metaPill.textContent.trim();
  const pipeIdx = pillText.indexOf('|');
  if (pipeIdx !== -1) {
    author = pillText.substring(0, pipeIdx).trim();
    lastUpdated = pillText.substring(pipeIdx + 1).trim();
  } else {
    // Fallback: try to find a date pattern anywhere in the pill
    const dateMatch = pillText.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/);
    if (dateMatch) lastUpdated = dateMatch[1];
    author = pillText.replace(lastUpdated, '').trim();
  }
}

// ── HTML → Markdown converter ──────────────────────────────────────────
// Lightweight DOM walker — no external dependencies.

function htmlToMarkdown(el) {
  const parts = [];

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    // Skip buttons (anchor-link copy buttons, export PDF, etc.)
    if (tag === 'button') return;
    // Skip SVGs
    if (tag === 'svg') return;

    switch (tag) {
      case 'h1':
        parts.push('\n# ' + node.textContent.trim().replace(/\s*Copy Anchor Link$/, '') + '\n\n');
        return;
      case 'h2':
        parts.push('\n## ' + node.textContent.trim().replace(/\s*Copy Anchor Link$/, '') + '\n\n');
        return;
      case 'h3':
        parts.push('\n### ' + node.textContent.trim().replace(/\s*Copy Anchor Link$/, '') + '\n\n');
        return;
      case 'h4':
        parts.push('\n#### ' + node.textContent.trim().replace(/\s*Copy Anchor Link$/, '') + '\n\n');
        return;

      case 'p':
        for (const c of node.childNodes) walk(c);
        parts.push('\n\n');
        return;

      case 'strong':
      case 'b':
        parts.push('**');
        for (const c of node.childNodes) walk(c);
        parts.push('**');
        return;

      case 'em':
      case 'i':
        parts.push('*');
        for (const c of node.childNodes) walk(c);
        parts.push('*');
        return;

      case 'code':
        // Inline code vs code block (inside <pre>)
        if (node.parentElement && node.parentElement.tagName === 'PRE') {
          // Code block — extract language from class
          const lang = (node.className.match(/language-(\w+)/) || [])[1] || '';
          parts.push('```' + lang + '\n' + node.textContent + '\n```\n\n');
        } else {
          parts.push('`' + node.textContent + '`');
        }
        return;

      case 'pre':
        // If pre contains a <code>, the code case handles it
        const codeChild = node.querySelector('code');
        if (codeChild) {
          walk(codeChild);
        } else {
          parts.push('```\n' + node.textContent + '\n```\n\n');
        }
        return;

      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = node.textContent.trim();
        if (text && href) {
          parts.push('[' + text + '](' + href + ')');
        } else if (text) {
          parts.push(text);
        }
        return;
      }

      case 'ul':
        for (const li of node.children) {
          if (li.tagName === 'LI') {
            parts.push('- ');
            for (const c of li.childNodes) walk(c);
            parts.push('\n');
          }
        }
        parts.push('\n');
        return;

      case 'ol': {
        let idx = 1;
        for (const li of node.children) {
          if (li.tagName === 'LI') {
            parts.push(idx + '. ');
            for (const c of li.childNodes) walk(c);
            parts.push('\n');
            idx++;
          }
        }
        parts.push('\n');
        return;
      }

      case 'table': {
        // Use direct child selectors to avoid double-counting nested tables
        const thead = node.querySelector(':scope > thead');
        const tbody = node.querySelector(':scope > tbody');
        const directRows = [
          ...(thead ? thead.querySelectorAll(':scope > tr') : []),
          ...(tbody ? tbody.querySelectorAll(':scope > tr') : node.querySelectorAll(':scope > tr')),
        ];
        if (directRows.length === 0) return;
        const tableRows = [];
        for (const row of directRows) {
          const cells = [...row.querySelectorAll(':scope > th, :scope > td')].map(c => c.textContent.trim().replace(/\|/g, '\\|'));
          tableRows.push(cells);
        }
        if (tableRows.length === 0) return;
        // Header row
        parts.push('| ' + tableRows[0].join(' | ') + ' |\n');
        parts.push('| ' + tableRows[0].map(() => '---').join(' | ') + ' |\n');
        // Data rows
        for (let i = 1; i < tableRows.length; i++) {
          parts.push('| ' + tableRows[i].join(' | ') + ' |\n');
        }
        parts.push('\n');
        return;
      }

      case 'img': {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        if (src) parts.push('![' + alt + '](' + src + ')');
        return;
      }

      case 'figure': {
        const img = node.querySelector('img');
        const cap = node.querySelector('figcaption');
        if (img) {
          const alt = cap ? cap.textContent.trim() : (img.getAttribute('alt') || '');
          const src = img.getAttribute('src') || '';
          parts.push('![' + alt + '](' + src + ')\n\n');
        }
        return;
      }

      case 'br':
        parts.push('\n');
        return;

      case 'hr':
        parts.push('\n---\n\n');
        return;

      case 'blockquote': {
        // Walk children to preserve inner structure (bold, links, code)
        const bqParts = [];
        const outerParts = parts;
        // Temporarily redirect output to bqParts
        const savedLength = parts.length;
        for (const c of node.childNodes) walk(c);
        // Collect what was just pushed and prefix with >
        const bqContent = parts.splice(savedLength).join('');
        const bqLines = bqContent.trim().split('\n').map(l => '> ' + l).join('\n');
        parts.push(bqLines + '\n\n');
        return;
      }

      default:
        // Generic container — recurse
        for (const c of node.childNodes) walk(c);
    }
  }

  // Article structure:
  //   children[0] = breadcrumb div ("General Security")
  //   children[1] = main wrapper containing header + content
  //     children[1].children[0] = header (h1 + metadata pills + Export PDF)
  //     children[1].children[1..N] = actual page content
  const mainWrapper = el.children[1];
  if (mainWrapper) {
    // Skip children[0] of the wrapper (the header with h1 + metadata)
    const kids = [...mainWrapper.children];
    for (let i = 1; i < kids.length; i++) {
      walk(kids[i]);
    }
  } else {
    // Fallback: walk everything
    for (const child of el.children) walk(child);
  }

  // Clean up: collapse multiple blank lines, trim
  return parts.join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const content = htmlToMarkdown(article);

const pagePath = '${{ args.path }}'.trim();

return [{
  title,
  path: pagePath,
  author,
  lastUpdated,
  content,
}];
