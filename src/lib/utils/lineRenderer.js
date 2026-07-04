import katex from 'katex';

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return out;
}

function renderMath(expr, display) {
  try {
    return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: display });
  } catch {
    return `<span class="katex-error">${escapeHtml(expr)}</span>`;
  }
}

function renderInlineWithLinks(text, notesByTitle) {
  // 1. Wikilinks
  const wikiMatches = [];
  let placeholders = text.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, target, _, alias) => {
    const idx = wikiMatches.length;
    wikiMatches.push({ target: target.trim(), alias: (alias || target).trim() });
    return `\u0000WIKI${idx}\u0000`;
  });

  // 2. Markdown links
  const linkMatches = [];
  placeholders = placeholders.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
    const idx = linkMatches.length;
    linkMatches.push({ label, url });
    return `\u0000LINK${idx}\u0000`;
  });

  // 3. Math — block ($$...$$) before inline ($...$) so the greedier pattern wins
  const mathMatches = [];
  placeholders = placeholders.replace(/\$\$([^$]+)\$\$/g, (m, expr) => {
    const idx = mathMatches.length;
    mathMatches.push({ expr, display: true });
    return `\u0000MATH${idx}\u0000`;
  });
  placeholders = placeholders.replace(/\$([^$\n]+)\$/g, (m, expr) => {
    const idx = mathMatches.length;
    mathMatches.push({ expr, display: false });
    return `\u0000MATH${idx}\u0000`;
  });

  // 4. Escape + apply bold/italic/code/strikethrough on what's left
  let html = renderInline(placeholders);

  // 5. Swap placeholders back in as real (unescaped) HTML
  html = html.replace(/\u0000WIKI(\d+)\u0000/g, (m, idx) => {
    const { target, alias } = wikiMatches[idx];
    const exists = notesByTitle?.has(target.toLowerCase());
    const cls = exists ? 'wikilink' : 'wikilink wikilink-new';
    return `<a href="#" class="${cls}" data-note-title="${escapeHtml(target)}">${escapeHtml(alias)}</a>`;
  });

  html = html.replace(/\u0000LINK(\d+)\u0000/g, (m, idx) => {
    const { label, url } = linkMatches[idx];
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  });

  html = html.replace(/\u0000MATH(\d+)\u0000/g, (m, idx) => {
    const { expr, display } = mathMatches[idx];
    return renderMath(expr, display);
  });

  return html;
}

export function renderLineHTML(rawLine, notesByTitle) {
  const line = rawLine ?? '';

  if (line.trim() === '') return '<span class="md-empty">&nbsp;</span>';

  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) return '<hr />';

  // Whole-line block math: $$ ... $$ spanning the entire line
  const blockMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
  if (blockMathMatch) {
    return `<div class="md-math-block">${renderMath(blockMathMatch[1], true)}</div>`;
  }

  const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    return `<h${level} class="md-h">${renderInlineWithLinks(headerMatch[2], notesByTitle)}</h${level}>`;
  }

  const quoteMatch = line.match(/^>\s?(.*)$/);
  if (quoteMatch) return `<blockquote>${renderInlineWithLinks(quoteMatch[1], notesByTitle)}</blockquote>`;

  const checkboxMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
  if (checkboxMatch) {
    const checked = checkboxMatch[2].toLowerCase() === 'x';
    return `<div class="md-li md-checkbox"><span class="checkbox">${checked ? '☑' : '☐'}</span><span class="${checked ? 'done' : ''}">${renderInlineWithLinks(checkboxMatch[3], notesByTitle)}</span></div>`;
  }

  const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (bulletMatch) return `<div class="md-li"><span class="bullet">•</span>${renderInlineWithLinks(bulletMatch[2], notesByTitle)}</div>`;

  const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numberedMatch) return `<div class="md-li"><span class="bullet">${numberedMatch[2]}.</span>${renderInlineWithLinks(numberedMatch[3], notesByTitle)}</div>`;

  return `<p class="md-p">${renderInlineWithLinks(line, notesByTitle)}</p>`;
}