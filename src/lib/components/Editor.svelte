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
  let containerEl;
  let saveTimeout;
  let exporting = $state(false);

  // --- autocomplete state ---
  let acVisible = $state(false);
  let acType = $state(null);
  let acQuery = $state('');
  let acIndex = $state(0);
  let acLineIndex = $state(null);
  let acStartOffset = $state(0);
  let acCaretOffset = $state(0);
  let acAnchor = $state({ top: 0, left: 0 });

  const SLASH_ITEMS = [
    { label: 'Heading 1', hint: '#', insert: '# ' },
    { label: 'Heading 2', hint: '##', insert: '## ' },
    { label: 'Heading 3', hint: '###', insert: '### ' },
    { label: 'Bullet list', hint: '-', insert: '- ' },
    { label: 'Numbered list', hint: '1.', insert: '1. ' },
    { label: 'Checklist', hint: '[ ]', insert: '- [ ] ' },
    { label: 'Quote', hint: '>', insert: '> ' },
    { label: 'Divider', hint: '---', insert: '---' },
    { label: 'Inline math', hint: '$', insert: '$$', caretOffset: 1 },
    { label: 'Math block', hint: '$$', insert: '$$  $$', caretOffset: 3 }
  ];

  let acResults = $derived.by(() => {
    if (!acVisible) return [];
    if (acType === 'slash') {
      const q = acQuery.toLowerCase();
      return SLASH_ITEMS.filter(item => item.label.toLowerCase().includes(q)).slice(0, 8);
    }
    if (acType === 'wikilink') {
      const q = acQuery.toLowerCase();
      const matches = $notes
        .filter(n => n.id !== note?.id)
        .filter(n => (n.title || '').toLowerCase().includes(q))
        .slice(0, 6)
        .map(n => ({ label: n.title || 'Untitled', title: n.title || 'Untitled', existing: true }));
      if (acQuery.trim() && !matches.some(m => m.title.toLowerCase() === q)) {
        matches.push({ label: `Create note "${acQuery.trim()}"`, title: acQuery.trim(), existing: false });
      }
      return matches;
    }
    return [];
  });

  $effect(() => {
    if (note && note.id !== loadedId) {
      const rawLines = (note.content || '').split('\n');
      lines = rawLines.map(text => ({ id: crypto.randomUUID(), text }));
      if (lines.length === 0) lines = [{ id: crypto.randomUUID(), text: '' }];
      titleInput = note.title || '';
      loadedId = note.id;
      activeLineIndex = null;
      closeAutocomplete();
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

  function activateLastLine() {
    if (lines.length === 0) return;
    activeLineIndex = lines.length - 1;
    pendingCaret = { offset: lines[lines.length - 1].text.length };
  }

  function toggleCheckboxAt(lineId) {
    const idx = lines.findIndex(l => l.id === lineId);
    if (idx === -1) return;
    const text = lines[idx].text;
    const m = text.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/);
    if (!m) return;
    const newChar = m[2].toLowerCase() === 'x' ? ' ' : 'x';
    lines[idx] = { ...lines[idx], text: m[1] + newChar + m[3] };
    lines = [...lines];
    scheduleContentSave();
  }

  function selectAllText() {
    if (!containerEl) return;
    const range = document.createRange();
    range.selectNodeContents(containerEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // --- autocomplete detection ---
  function detectAutocomplete(text, offset) {
    const before = text.slice(0, offset);
    const wikiIdx = before.lastIndexOf('[[');
    if (wikiIdx !== -1) {
      const between = before.slice(wikiIdx + 2);
      if (!between.includes(']]') && !between.includes('[[')) {
        return { type: 'wikilink', query: between, startOffset: wikiIdx };
      }
    }
    if (before.startsWith('/') && !before.slice(1).includes(' ') && !before.includes('[[')) {
      return { type: 'slash', query: before.slice(1), startOffset: 0 };
    }
    return null;
  }

  function updateAutocompleteAnchor(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    let rect = range.getClientRects()[0];
    if (!rect) rect = range.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.left === 0)) rect = el.getBoundingClientRect();
    acAnchor = { top: rect.bottom + 4, left: rect.left };
  }

  function refreshAutocomplete(i, el) {
    const text = el.textContent;
    const offset = getCaretOffset(el);
    const match = detectAutocomplete(text, offset);
    if (match) {
      acVisible = true;
      acType = match.type;
      acQuery = match.query;
      acStartOffset = match.startOffset;
      acCaretOffset = offset;
      acLineIndex = i;
      acIndex = 0;
      updateAutocompleteAnchor(el);
    } else {
      closeAutocomplete();
    }
  }

  function closeAutocomplete() {
    acVisible = false;
    acType = null;
    acQuery = '';
    acLineIndex = null;
  }

  function selectAcItem(item) {
    if (acLineIndex === null) return;
    const i = acLineIndex;
    const line = lines[i];
    const el = lineRefs[line.id];
    if (!el) return;

    const text = el.textContent;
    let insertText, newCaretOffset;

    if (acType === 'wikilink') {
      insertText = `[[${item.title}]]`;
      newCaretOffset = acStartOffset + insertText.length;
    } else {
      insertText = item.insert;
      newCaretOffset = acStartOffset + (item.caretOffset ?? item.insert.length);
    }

    const newText = text.slice(0, acStartOffset) + insertText + text.slice(acCaretOffset);
    el.textContent = newText;
    lines[i].text = newText;
    lines = [...lines];

    closeAutocomplete();
    el.focus();
    placeCaret(el, newCaretOffset);
    scheduleContentSave();
  }

  function findLineElFromNode(node) {
    const el = node?.nodeType === 3 ? node.parentElement : node;
    return el?.closest?.('.md-line') ?? null;
  }

  // --- guard: block edits to any line that isn't the active one ---
  function handleBeforeInput(e) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { e.preventDefault(); return; }

    // block rich-text formatting commands entirely (bold shortcuts etc.)
    if (e.inputType && e.inputType.startsWith('format')) {
      e.preventDefault();
      return;
    }

    const lineEl = findLineElFromNode(sel.getRangeAt(0).startContainer);
    const activeId = activeLineIndex !== null ? lines[activeLineIndex]?.id : null;

    if (!lineEl || !activeId || lineEl.dataset.lineId !== activeId) {
      e.preventDefault();
      // if user starts typing on an inactive line, activate it instead of eating the keystroke silently
      if (lineEl) {
        const idx = lines.findIndex(l => l.id === lineEl.dataset.lineId);
        if (idx !== -1) {
          activeLineIndex = idx;
          pendingCaret = { offset: getCaretOffset(lineEl) };
        }
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    if (activeLineIndex === null) return;
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const line = lines[activeLineIndex];
    const el = lineRefs[line.id];
    if (!el) return;
    const offset = getCaretOffset(el);
    const current = el.textContent;
    const newText = current.slice(0, offset) + text + current.slice(offset);
    el.textContent = newText;
    lines[activeLineIndex].text = newText;
    lines = [...lines];
    placeCaret(el, offset + text.length);
    scheduleContentSave();
  }

  // --- container-level click (line activation, checkbox toggle, wikilink nav) ---
  function handleContainerClick(e) {
    const checkboxEl = e.target.closest('.checkbox');
    if (checkboxEl) {
      e.preventDefault();
      const lineDiv = e.target.closest('.md-line');
      if (lineDiv) toggleCheckboxAt(lineDiv.dataset.lineId);
      return;
    }

    const wikiLink = e.target.closest('a.wikilink');
    if (wikiLink) {
      e.preventDefault();
      onOpenNoteByTitle(wikiLink.dataset.noteTitle);
      return;
    }
    if (e.target.closest('a')) return;

    // don't hijack an active drag-selection
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    const lineDiv = e.target.closest('.md-line');
    if (lineDiv) {
      const idx = lines.findIndex(l => l.id === lineDiv.dataset.lineId);
      if (idx !== -1 && idx !== activeLineIndex) {
        activeLineIndex = idx;
        pendingCaret = { fromClick: { x: e.clientX, y: e.clientY } };
      }
      return;
    }

    activateLastLine();
  }

  // --- container-level input (only the active line's text is ever synced back) ---
  function handleContainerInput(e) {
    if (activeLineIndex === null) return;
    const line = lines[activeLineIndex];
    const el = lineRefs[line.id];
    if (!el) return;
    if (e.target !== el && !el.contains(e.target)) return;

    lines[activeLineIndex].text = el.textContent;
    scheduleContentSave();
    refreshAutocomplete(activeLineIndex, el);
  }

  function handleContainerBlur() {
    setTimeout(() => {
      if (containerEl && document.activeElement && containerEl.contains(document.activeElement)) return;
      activeLineIndex = null;
      closeAutocomplete();
    }, 120);
  }

  function handleContainerKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAllText();
      return;
    }

    // block bold/italic/underline shortcuts from mutating contenteditable DOM
    if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }

    if (acVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, Math.max(acResults.length - 1, 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (acResults.length > 0) {
          e.preventDefault();
          selectAcItem(acResults[acIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAutocomplete();
        return;
      }
    }

    if (activeLineIndex === null) return;

    // let native browser selection handle shift+arrow across lines
    if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      return;
    }

    const i = activeLineIndex;
    const line = lines[i];
    const el = lineRefs[line.id];
    if (!el) return;

    const text = el.textContent;
    const offset = getCaretOffset(el);

    if (e.key === 'Escape') {
      activeLineIndex = null;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      closeAutocomplete();
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
      closeAutocomplete();
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
      closeAutocomplete();
      activeLineIndex = i - 1;
      pendingCaret = { offset };
      return;
    }

    if (e.key === 'ArrowDown') {
      if (i === lines.length - 1) return;
      e.preventDefault();
      closeAutocomplete();
      activeLineIndex = i + 1;
      pendingCaret = { offset };
      return;
    }

    if (e.key === 'ArrowLeft' && offset === 0) {
      if (i === 0) return;
      e.preventDefault();
      closeAutocomplete();
      activeLineIndex = i - 1;
      pendingCaret = { offset: lines[i - 1].text.length };
      return;
    }

    if (e.key === 'ArrowRight' && offset === text.length) {
      if (i === lines.length - 1) return;
      e.preventDefault();
      closeAutocomplete();
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
      wrapper.style.fontFamily = "'Inter', -apple-system, sans-serif";
      wrapper.style.width = '700px';

      const titleEl = document.createElement('h1');
      titleEl.textContent = titleInput || 'Untitled';
      titleEl.style.fontSize = '26px';
      titleEl.style.marginBottom = '16px';
      wrapper.appendChild(titleEl);

      // Collapse any run of consecutive blank lines into a single paragraph gap,
      // instead of stacking one empty block per blank line.
      let pendingGap = false;
      for (const line of lines) {
        if (line.text.trim() === '') {
          pendingGap = true;
          continue;
        }
        const lineDiv = document.createElement('div');
        lineDiv.innerHTML = renderLineHTML(line.text, $notesByTitle);
        lineDiv.style.marginTop = pendingGap ? '14px' : '0';
        lineDiv.style.marginBottom = '4px';
        wrapper.appendChild(lineDiv);
        pendingGap = false;
      }

      wrapper.querySelectorAll('*').forEach(el => { el.style.color = '#111111'; });
      wrapper.querySelectorAll('a.wikilink').forEach(el => { el.style.color = '#2563eb'; });
      wrapper.querySelectorAll('code').forEach(el => { el.style.background = '#f1f1f1'; });
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

    <div
      class="lines-container"
      contenteditable="true"
      bind:this={containerEl}
      onclick={handleContainerClick}
      onkeydown={handleContainerKeydown}
      onbeforeinput={handleBeforeInput}
      oninput={handleContainerInput}
      onpaste={handlePaste}
      onblur={handleContainerBlur}
    >
      {#each lines as line, i (line.id)}
        {#if i === activeLineIndex}
          <div
            class="md-line raw"
            data-line-id={line.id}
            bind:this={lineRefs[line.id]}
            use:initText={line.text}
          ></div>
        {:else}
          <div
            class="md-line rendered"
            data-line-id={line.id}
          >{@html renderLineHTML(line.text, $notesByTitle)}</div>
        {/if}
      {/each}
    </div>

    {#if acVisible && acResults.length > 0}
      <div class="ac-popover" style:top="{acAnchor.top}px" style:left="{acAnchor.left}px">
        {#each acResults as item, idx}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div
            class="ac-item"
            class:selected={idx === acIndex}
            onmousedown={(e) => { e.preventDefault(); selectAcItem(item); }}
          >
            <span class="ac-label">{item.label}</span>
            {#if item.hint}<span class="ac-hint">{item.hint}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="empty">Select or create a note to get started</div>
{/if}

<style>
  .editor { display: flex; flex-direction: column; height: 100%; position: relative; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #2a2a2a; }
  .title { font-size: 20px; font-weight: 600; background: none; border: none; color: #eee; flex: 1; }
  .pdf-btn { background: #2a2a2a; color: #ddd; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .pdf-btn:hover { background: #333; }
  .pdf-btn:disabled { opacity: 0.6; cursor: default; }
  .lines-container { flex: 1; overflow-y: auto; padding: 16px 24px; color: #ddd; line-height: 1.6; cursor: text; outline: none; }
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

  .ac-popover {
    position: fixed;
    z-index: 200;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    min-width: 200px;
    max-width: 320px;
    overflow: hidden;
  }
  .ac-item { display: flex; justify-content: space-between; align-items: center; padding: 7px 12px; cursor: pointer; font-size: 13px; color: #ddd; }
  .ac-item.selected, .ac-item:hover { background: #333; }
  .ac-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ac-hint { color: #7dabf8; font-family: 'SF Mono', monospace; font-size: 11px; margin-left: 12px; }
</style>