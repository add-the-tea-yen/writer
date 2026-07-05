<script>
  import { onMount, onDestroy, untrack } from 'svelte';
  import { notes, activeNoteId } from '$lib/stores/notes';
  import { extractWikilinks } from '$lib/utils/wikilinks';

  const width = 800, height = 600;
  const MAX_FRAMES = 400;

  let nodes = $state([]);
  let links = $state([]);
  let alpha = $state(0);
  let raf = null;
  let frameCount = 0;

  let vx = $state(0), vy = $state(0), vw = $state(width), vh = $state(height);

  let svgEl;
  let panning = false;
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

  let draggingNode = null;
  let dragMoved = false;
  let dragStartClient = { x: 0, y: 0 };

  function buildGraph(notesArr) {
    const idByTitle = new Map(notesArr.map(n => [(n.title||'').toLowerCase(), n.id]));

    // untrack: read the CURRENT nodes without making this a reactive dependency
    const prevNodes = untrack(() => nodes);
    const prev = new Map(prevNodes.map(n => [n.id, n]));

    nodes = notesArr.map(n => {
      const existing = prev.get(n.id);
      return existing
        ? { ...existing, title: n.title }
        : { id: n.id, title: n.title, x: width/2 + (Math.random()-0.5)*200, y: height/2 + (Math.random()-0.5)*200, vx: 0, vy: 0 };
    });

    const newLinks = [];
    for (const n of notesArr) {
      for (const target of extractWikilinks(n.content || '')) {
        const targetId = idByTitle.get(target.toLowerCase());
        if (targetId && targetId !== n.id) newLinks.push({ source: n.id, target: targetId });
      }
    }
    links = newLinks;
    reheat();
  }

  $effect(() => {
    buildGraph($notes);
  });

  function reheat() {
    alpha = 1;
    frameCount = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    frameCount++;
    if (alpha < 0.01 || frameCount > MAX_FRAMES) { raf = null; return; }

    const byId = new Map(nodes.map(n => [n.id, n]));
    const repulsion = 2000;
    const linkDist = 100;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a === draggingNode) continue;
      let fx = 0, fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const distSq = Math.max(dx*dx + dy*dy, 1);
        if (distSq > 90000) continue;
        const force = repulsion / distSq;
        const dist = Math.sqrt(distSq);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      fx += (width/2 - a.x) * 0.01;
      fy += (height/2 - a.y) * 0.01;
      a.vx = (a.vx + fx) * 0.5;
      a.vy = (a.vy + fy) * 0.5;
    }

    for (const l of links) {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const diff = (dist - linkDist) * 0.02;
      const ox = (dx/dist) * diff, oy = (dy/dist) * diff;
      if (a !== draggingNode) { a.vx += ox; a.vy += oy; }
      if (b !== draggingNode) { b.vx -= ox; b.vy -= oy; }
    }

    for (const n of nodes) {
      if (n === draggingNode) continue;
      n.x += n.vx * 0.1 * alpha;
      n.y += n.vy * 0.1 * alpha;
      n.x = Math.max(20, Math.min(width-20, n.x));
      n.y = Math.max(20, Math.min(height-20, n.y));
    }

    alpha *= 0.96;
    nodes = [...nodes];
    raf = requestAnimationFrame(tick);
  }

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    stopDragListeners();
  });

  let nodeById = $derived(new Map(nodes.map(n => [n.id, n])));
  function nodePos(id) {
    return nodeById.get(id);
  }

  function clientToSvg(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const x = vx + ((clientX - rect.left) / rect.width) * vw;
    const y = vy + ((clientY - rect.top) / rect.height) * vh;
    return { x, y };
  }

  function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const { x: cx, y: cy } = clientToSvg(e.clientX, e.clientY);
    const newVw = Math.max(100, Math.min(width * 4, vw * zoomFactor));
    const newVh = Math.max(75, Math.min(height * 4, vh * zoomFactor));
    vx = cx - (cx - vx) * (newVw / vw);
    vy = cy - (cy - vy) * (newVh / vh);
    vw = newVw;
    vh = newVh;
  }

  // --- window-level drag handling (robust even if pointerup happens outside the browser) ---
  function onWindowPointerMove(e) {
    if (draggingNode) {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      draggingNode.x = Math.max(20, Math.min(width-20, x));
      draggingNode.y = Math.max(20, Math.min(height-20, y));
      draggingNode.vx = 0;
      draggingNode.vy = 0;
      nodes = [...nodes];
      if (Math.hypot(e.clientX - dragStartClient.x, e.clientY - dragStartClient.y) > 4) dragMoved = true;
      return;
    }
    if (panning) {
      const rect = svgEl.getBoundingClientRect();
      const dx = ((e.clientX - panStart.x) / rect.width) * vw;
      const dy = ((e.clientY - panStart.y) / rect.height) * vh;
      vx = panStart.vx - dx;
      vy = panStart.vy - dy;
    }
  }

  function endDrag() {
    panning = false;
    if (draggingNode) {
      const wasClick = !dragMoved;
      const clicked = draggingNode;
      draggingNode = null;
      if (wasClick) activeNoteId.set(clicked.id);
      else reheat();
    }
    stopDragListeners();
  }

  function startDragListeners() {
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
  }

  function stopDragListeners() {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    window.removeEventListener('blur', endDrag);
  }

  function handleBgPointerDown(e) {
    if (draggingNode) return;
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, vx, vy };
    startDragListeners();
  }

  function handleNodePointerDown(e, n) {
    e.stopPropagation();
    draggingNode = n;
    dragMoved = false;
    dragStartClient = { x: e.clientX, y: e.clientY };
    startDragListeners();
  }

  function resetView() {
    vx = 0; vy = 0; vw = width; vh = height;
  }
</script>

<div class="graph-wrap">
  <button class="reset-btn" onclick={resetView}>Reset view</button>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg
    bind:this={svgEl}
    viewBox="{vx} {vy} {vw} {vh}"
    class="graph"
    role="application"
    aria-label="Note graph, draggable and zoomable"
    tabindex="0"
    onwheel={handleWheel}
    onpointerdown={handleBgPointerDown}
  >
    {#each links as l}
      {#if nodePos(l.source) && nodePos(l.target)}
        <line
          x1={nodePos(l.source).x} y1={nodePos(l.source).y}
          x2={nodePos(l.target).x} y2={nodePos(l.target).y}
          stroke="#444"
        />
      {/if}
    {/each}
    {#each nodes as n (n.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <g
        class="node"
        class:active={n.id === $activeNoteId}
        onpointerdown={(e) => handleNodePointerDown(e, n)}
      >
        <circle cx={n.x} cy={n.y} r="6" />
        <text x={n.x + 10} y={n.y + 4}>{n.title || 'Untitled'}</text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .graph-wrap { position: relative; width: 100%; height: 100%; }
  .graph { width: 100%; height: 100%; background: #181818; touch-action: none; cursor: grab; }
  .reset-btn { position: absolute; top: 8px; right: 8px; z-index: 5; background: #2a2a2a; color: #ddd; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .node circle { fill: #7dabf8; cursor: pointer; }
  .node.active circle { fill: #f87171; }
  .node text { fill: #ccc; font-size: 11px; cursor: pointer; user-select: none; }
</style>