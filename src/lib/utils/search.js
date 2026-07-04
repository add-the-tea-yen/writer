export function searchNotes(notesArr, queryStr) {
  const q = queryStr.trim().toLowerCase();
  if (!q) return [];
  return notesArr
    .map((n) => {
      const title = (n.title || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      const titleMatch = title.includes(q);
      const idx = content.indexOf(q);
      if (!titleMatch && idx === -1) return null;
      let snippet = '';
      if (idx !== -1) {
        const start = Math.max(0, idx - 30);
        snippet = (start > 0 ? '…' : '') + n.content.slice(start, idx + q.length + 30) + '…';
      }
      const score = (titleMatch ? 10 : 0) + (idx !== -1 ? 1 : 0);
      return { note: n, snippet, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}