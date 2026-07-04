<script>
  import { notes, activeNoteId, createNote, deleteNote } from '$lib/stores/notes';

  let grouped = $derived(groupByFolder($notes));

  function groupByFolder(list) {
    const map = new Map();
    for (const n of list) {
      const folder = n.folder || 'Notes';
      if (!map.has(folder)) map.set(folder, []);
      map.get(folder).push(n);
    }
    return map;
  }

  async function handleNew() {
    await createNote({ title: 'Untitled', content: '' });
  }

  function open(id) {
    activeNoteId.set(id);
  }

  async function remove(e, id) {
    e.stopPropagation();
    if (confirm('Delete this note?')) await deleteNote(id);
  }
</script>

<div class="sidebar">
  <button class="new-note" onclick={handleNew}>+ New note</button>
  {#each [...grouped.entries()] as [folder, items]}
    <div class="folder">
      <div class="folder-name">{folder}</div>
      {#each items as note (note.id)}
        <div
            class="file"
            class:active={$activeNoteId === note.id}
            role="button"
            tabindex="0"
            onclick={() => open(note.id)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && open(note.id)}
            >
          <span>{note.title || 'Untitled'}</span>
          <button class="delete" onclick={(e) => remove(e, note.id)}>×</button>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .sidebar { width: 240px; border-right: 1px solid #2a2a2a; background: #1e1e1e; color: #ddd; height: 100%; overflow-y: auto; padding: 8px; box-sizing: border-box; }
  .new-note { width: 100%; margin-bottom: 8px; background: #333; color: #fff; border: none; padding: 6px; border-radius: 4px; cursor: pointer; }
  .folder-name { font-size: 11px; text-transform: uppercase; color: #888; margin: 8px 4px 4px; }
  .file { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 14px; }
  .file:hover { background: #2a2a2a; }
  .file.active { background: #37373d; }
  .delete { background: none; border: none; color: #888; cursor: pointer; visibility: hidden; }
  .file:hover .delete { visibility: visible; }
</style>