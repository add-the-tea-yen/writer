<script>
  import { tick } from 'svelte';
  import { notes, activeNoteId, notesByTitle, updateNote } from '$lib/stores/notes';
  import { renderLineHTML } from '$lib/utils/lineRenderer';

  let { onOpenNoteByTitle = () => {} } = $props();

  let note = $derived($notes.find(n => n.id === $activeNoteId));

  let lines = $state([]);
  let titleInput = $state('');
  let loadedId = $state(null);
  let activeLineIndex = $state(null);
  let pendingCaret = null;
  let lineRefs = {};
  let saveTimeout;
  let exportContainer = $state();
  let exporting = $state(false);

  $effect(() => {
    if (note && note.id !== loadedId) {
      const rawLines = (note.content || '').split('\n');
      lines = rawLines.map(text => ({ id: crypto.randomUUID(), text }));
      if (lines.length === 0) lines = [{ id: crypto.randomUUID(), text: '' }];
      titleInput = note.title || '';
      loadedId = note.id;
      activeLineIndex = null;
    }
  });

  function scheduleContentSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (note) updateNote(note.id, { content: lines.map(l => l.text).join('\n') });
    }, 500);
  }

  function onTitleInput(e) {
    titleInput = e.target.value;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (note) updateNote(note.id, { title: titleInput });
    }, 500);
  }

  function getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    if (range.startContainer === el) return 0;
    return range.startOffset;
  }

  function placeCaret(el, offset) {
    const sel = window.getSelection();
    const range = document.createRange();
    const textNode = el.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      range.setStart(textNode, Math.min(offset, textNode.length));
    } else {
      range.selectNodeContents(el);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function initText(node, text) {
    node.textContent = text;
  }

  function activateLine(i, e) {
    const wikiLink = e.target.closest('a.wikilink');
    if (wikiLink) {
      e.preventDefault();
      onOpenNoteByTitle(wikiLink.dataset.noteTitle);
      return;
    }
    if (e.target.closest('a')) return;

    activeLineIndex = i;
    pendingCaret = { fromClick: { x: e.clientX, y: e.clientY } };
  }

  function activateLastLine() {
    if (lines.length === 0) return;
    activeLineIndex = lines.length - 1;
    pendingCaret = { offset: lines[lines.length - 1].text.length };
  }

  function handleInput(e, i) {
    lines[i].text = e.currentTarget.textContent;
    scheduleContentSave();
  }

  function handleBlur(i) {
    setTimeout(() => {
      if (activeLineIndex === i) activeLineIndex = null;
    }, 0);
  }

  function handleKeydown(e, i) {
    const el = e.currentTarget;
    const text = el.textContent;
    const offset = getCaretOffset(el);

    if (e.key === 'Escape') {
      activeLineIndex = null;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      lines[i] = { ...lines[i], text: before };
      lines.splice(i + 1, 0, { id: crypto.randomUUID(), text: after });
      lines = [...lines];
      activeLineIndex = i + 1;
      pendingCaret = { offset: 0 };
      scheduleContentSave();
      return;
    }

    if (e.key === 'Backspace' && offset === 0) {
      if (i === 0) return;
      e.preventDefault();
      const prev = lines[i - 1];
      const mergeOffset = prev.text.length;
      lines[i - 1] = { ...prev, text: prev.text + text };
      lines.splice(i, 1);
      lines = [...lines];
      activeLineIndex = i - 1;
      pendingCaret = { offset: mergeOffset };
      scheduleContentSave();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (i === 0) return;
      e.preventDefault();
      activeLineIndex = i - 1;
      pendingCaret = { offset };
      return;
    }

    if (e.key === 'ArrowDown') {
      if (i === lines.length - 1) return;
      e.preventDefault();
      activeLineIndex = i + 1;
      pendingCaret = { offset };
      return;
    }

    if (e.key === 'ArrowLeft' && offset === 0) {
      if (i === 0) return;
      e.preventDefault();
      activeLineIndex = i - 1;
      pendingCaret = { offset: lines[i - 1].text.length };
      return;
    }

    if (e.key === 'ArrowRight' && offset === text.length) {
      if (i === lines.length - 1) return;
      e.preventDefault();
      activeLineIndex = i + 1;
      pendingCaret = { offset: 0 };
      return;
    }
  }

  $effect(() => {
    const idx = activeLineIndex;
    if (idx === null || idx === undefined || !lines[idx]) return;
    const id = lines[idx].id;
    tick().then(() => {
      const el = lineRefs[id];
      if (!el) return;
      el.focus();
      if (pendingCaret?.fromClick && document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(pendingCaret.fromClick.x, pendingCaret.fromClick.y);
        if (range && el.contains(range.startContainer)) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          placeCaret(el, el.textContent.length);
        }
      } else if (pendingCaret && typeof pendingCaret.offset === 'number') {
        placeCaret(el, pendingCaret.offset);
      } else {
        placeCaret(el, el.textContent.length);
      }
      pendingCaret = null;
    });
  });

  async function downloadPdf() {
    if (!note || exporting) return;
    exporting = true;
    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const wrapper = document.createElement('div');
      wrapper.style.background = '#ffffff';
      wrapper.style.color = '#111111';
      wrapper.style.padding = '32px';
      wrapper.style.fontFamily = '-apple-system, sans-serif';
      wrapper.style.width = '700px';

      const titleEl = document.createElement('h1');
      titleEl.textContent = titleInput || 'Untitled';
      titleEl.style.fontSize = '26px';
      titleEl.style.marginBottom = '16px';
      wrapper.appendChild(titleEl);

      for (const line of lines) {
        const lineDiv = document.createElement('div');
        lineDiv.innerHTML = renderLineHTML(line.text, $notesByTitle);
        lineDiv.style.marginBottom = '4px';
        wrapper.appendChild(lineDiv);
      }

      // Force readable colors for PDF (dark-mode styles use light text)
      wrapper.querySelectorAll('*').forEach(el => {
        el.style.color = '#111111';
      });
      wrapper.querySelectorAll('a.wikilink').forEach(el => {
        el.style.color = '#2563eb';
      });
      wrapper.querySelectorAll('code').forEach(el => {
        el.style.background = '#f1f1f1';
      });
      wrapper.querySelectorAll('blockquote').forEach(el => {
        el.style.borderLeft = '3px solid #ccc';
        el.style.paddingLeft = '12px';
      });

      const filename = `${(titleInput || 'Untitled').replace(/[^\w\- ]/g, '')}.pdf`;

      await html2pdf()
        .set({
          margin: 10,
          filename,
          html2canvas: { scale: 2, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(wrapper)
        .save();
    } finally {
      exporting = false;
    }
  }
</script>

{#if note}
  <div class="editor">
    <div class="toolbar">
      <input class="title" value={titleInput} oninput={onTitleInput} />
      <button class="pdf-btn" onclick={downloadPdf} disabled={exporting}>
        {exporting ? 'Exporting…' : '⬇ Download PDF'}
      </button>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lines-container" onclick={(e) => { if (e.target.classList.contains('lines-container')) activateLastLine(); }}>
      {#each lines as line, i (line.id)}
        {#if i === activeLineIndex}
          <div
            class="md-line raw"
            contenteditable="true"
            bind:this={lineRefs[line.id]}
            use:initText={line.text}
            oninput={(e) => handleInput(e, i)}
            onkeydown={(e) => handleKeydown(e, i)}
            onblur={() => handleBlur(i)}
          ></div>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="md-line rendered" onclick={(e) => activateLine(i, e)}>
            {@html renderLineHTML(line.text, $notesByTitle)}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{:else}
  <div class="empty">Select or create a note to get started</div>
{/if}

<style>
  .editor { display: flex; flex-direction: column; height: 100%; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #2a2a2a; }
  .title { font-size: 20px; font-weight: 600; background: none; border: none; color: #eee; flex: 1; }
  .pdf-btn { background: #2a2a2a; color: #ddd; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .pdf-btn:hover { background: #333; }
  .pdf-btn:disabled { opacity: 0.6; cursor: default; }
  .lines-container { flex: 1; overflow-y: auto; padding: 16px 24px; color: #ddd; line-height: 1.6; cursor: text; }
  .md-line { min-height: 1.6em; outline: none; }
  .md-line.raw { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
  .md-line.rendered :global(p), .md-line.rendered :global(h1), .md-line.rendered :global(h2),
  .md-line.rendered :global(h3), .md-line.rendered :global(h4), .md-line.rendered :global(h5),
  .md-line.rendered :global(h6), .md-line.rendered :global(blockquote), .md-line.rendered :global(.md-li) {
    margin: 0;
  }
  .md-line.rendered :global(.md-h) { font-weight: 700; margin-top: 0.3em; }
  .md-line.rendered :global(h1) { font-size: 1.8em; }
  .md-line.rendered :global(h2) { font-size: 1.5em; }
  .md-line.rendered :global(h3) { font-size: 1.25em; }
  .md-line.rendered :global(blockquote) { border-left: 3px solid #444; padding-left: 12px; color: #aaa; }
  .md-line.rendered :global(.md-li) { display: flex; gap: 6px; }
  .md-line.rendered :global(.bullet) { color: #888; min-width: 1.2em; }
  .md-line.rendered :global(.checkbox) { cursor: pointer; }
  .md-line.rendered :global(.done) { text-decoration: line-through; color: #777; }
  .md-line.rendered :global(code) { background: #2a2a2a; padding: 1px 5px; border-radius: 3px; font-family: 'SF Mono', monospace; font-size: 0.9em; }
  .md-line.rendered :global(hr) { border: none; border-top: 1px solid #333; margin: 8px 0; }
  .md-line.rendered :global(a.wikilink) { color: #7dabf8; text-decoration: none; border-bottom: 1px dotted #7dabf8; cursor: pointer; }
  .md-line.rendered :global(a.wikilink-new) { color: #f87171; }
  .md-line.rendered :global(.md-math-block) { margin: 8px 0; overflow-x: auto; }
  .md-line.rendered :global(.katex) { color: #eee; }
  .md-line.rendered :global(.katex-error) { color: #f87171; font-family: monospace; }
  .empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #666; }
</style>