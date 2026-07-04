<script>
  import { notes, activeNoteId } from '$lib/stores/notes';
  import { searchNotes } from '$lib/utils/search';

  let { open = false, onClose = () => {} } = $props();

  let q = $state('');
  let results = $derived(searchNotes($notes, q));

  function select(id) {
    activeNoteId.set(id);
    q = '';
    onClose();
  }

  function handleKey(e) {
    if (e.key === 'Escape') onClose();
  }

  function focusOnMount(node) {
    node.focus();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={handleKey}>
      <input use:focusOnMount placeholder="Search notes..." bind:value={q} />
      <div class="results">
        {#each results as r}
          <div
            class="result"
            role="button"
            tabindex="0"
            onclick={() => select(r.note.id)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && select(r.note.id)}
          >
            <div class="title">{r.note.title || 'Untitled'}</div>
            {#if r.snippet}<div class="snippet">{r.snippet}</div>{/if}
          </div>
        {/each}
        {#if q && results.length === 0}<div class="empty">No results</div>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; padding-top: 100px; z-index: 100; }
  .modal { width: 480px; background: #222; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
  input { width: 100%; box-sizing: border-box; padding: 14px 16px; background: #1a1a1a; border: none; color: #eee; font-size: 15px; outline: none; }
  .results { max-height: 320px; overflow-y: auto; }
  .result { padding: 10px 16px; cursor: pointer; border-top: 1px solid #2a2a2a; }
  .result:hover { background: #2a2a2a; }
  .title { color: #eee; font-size: 14px; }
  .snippet { color: #888; font-size: 12px; margin-top: 2px; }
  .empty { padding: 16px; color: #666; }
</style>