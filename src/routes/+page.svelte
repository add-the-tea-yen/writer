<script>
  import { user, authLoading, logout } from '$lib/stores/auth';
  import { notesByTitle, activeNoteId, createNote } from '$lib/stores/notes';
  import Login from '$lib/components/Login.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Backlinks from '$lib/components/Backlinks.svelte';
  import GraphView from '$lib/components/GraphView.svelte';
  import SearchModal from '$lib/components/SearchModal.svelte';

  let showGraph = $state(false);
  let showSearch = $state(false);

  async function openNoteByTitle(title) {
    const existing = $notesByTitle.get(title.toLowerCase());
    if (existing) {
      activeNoteId.set(existing.id);
    } else {
      await createNote({ title, content: '' });
    }
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      showSearch = true;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $authLoading}
  <div class="loading">Loading...</div>
{:else if !$user}
  <Login />
{:else}
  <div class="app">
    <Sidebar />
    <main>
      <div class="topbar">
        <button onclick={() => showSearch = true}>🔍 Search (⌘K)</button>
        <button onclick={() => showGraph = !showGraph}>{showGraph ? 'Close Graph' : '🕸 Graph'}</button>
        <span class="spacer"></span>
        <span class="user">{$user.displayName}</span>
        <button onclick={logout}>Sign out</button>
      </div>
      <div class="content">
        <div class="pane" style:display={showGraph ? 'none' : 'block'}>
          <Editor onOpenNoteByTitle={openNoteByTitle} />
        </div>
        <div class="pane" style:display={showGraph ? 'block' : 'none'}>
          <GraphView />
        </div>
      </div>
    </main>
    {#if !showGraph}<Backlinks />{/if}
  </div>
  <SearchModal open={showSearch} onClose={() => showSearch = false} />
{/if}

<style>
  .loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #888; }
  .app { display: flex; height: 100vh; font-family: 'Inter', -apple-system, sans-serif; }
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #2a2a2a; }
  .topbar button { background: #2a2a2a; color: #ddd; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .spacer { flex: 1; }
  .user { color: #999; font-size: 13px; }
  .content { flex: 1; overflow: hidden; position: relative; }
  .pane { height: 100%; }
</style>