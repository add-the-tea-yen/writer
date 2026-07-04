import { marked } from 'marked';

const WIKILINK_REGEX = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

export function extractWikilinks(content) {
  const links = new Set();
  let match;
  WIKILINK_REGEX.lastIndex = 0;
  while ((match = WIKILINK_REGEX.exec(content || '')) !== null) {
    links.add(match[1].trim());
  }
  return [...links];
}

export function renderNote(content, notesByTitle) {
  const withHtmlLinks = (content || '').replace(WIKILINK_REGEX, (_, target, __, alias) => {
    const cleanTarget = target.trim();
    const label = (alias || cleanTarget).trim();
    const exists = notesByTitle.has(cleanTarget.toLowerCase());
    const cls = exists ? 'wikilink' : 'wikilink wikilink-new';
    return `<a href="#" class="${cls}" data-note-title="${cleanTarget}">${label}</a>`;
  });
  return marked.parse(withHtmlLinks);
}