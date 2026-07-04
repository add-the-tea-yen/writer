<script>
  import { notes, activeNoteId, backlinksMap } from '$lib/stores/notes';

  let note = $derived($notes.find(n => n.id === $activeNoteId));
  let linkedFrom = $derived(note ? ($backlinksMap.get((note.title || '').toLowerCase()) || []) : []);

  function open(id) {
    activeNoteId.set(id);
  }
</script>

{#if note}
  <div class="backlinks">
    <div class="heading">Linked mentions ({linkedFrom.length})</div>
    {#if linkedFrom.length === 0}
      <div class="empty">No backlinks yet</div>
    {:else}
      {#each linkedFrom as l}
        <div
            class="item"
            role="button"
            tabindex="0"
            onclick={() => open(l.id)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && open(l.id)}
        >{l.title || 'Untitled'}</div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .backlinks { width: 220px; border-left: 1px solid #2a2a2a; padding: 12px; color: #ccc; overflow-y: auto; }
  .heading { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; }
  .item { padding: 6px 4px; cursor: pointer; border-radius: 4px; font-size: 14px; }
  .item:hover { background: #2a2a2a; }
  .empty { color: #555; font-size: 13px; }
</style>