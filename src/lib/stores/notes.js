import { writable, derived, get } from 'svelte/store';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import { user } from './auth';
import { extractWikilinks } from '$lib/utils/wikilinks';

export const notes = writable([]);
export const activeNoteId = writable(null);
export const loadingNotes = writable(true);

let unsubscribeNotes = null;

user.subscribe((u) => {
  if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }
  if (!u) { notes.set([]); loadingNotes.set(false); return; }
  loadingNotes.set(true);
  const q = query(collection(db, 'users', u.uid, 'notes'), orderBy('updatedAt', 'desc'));
  unsubscribeNotes = onSnapshot(q, (snap) => {
    notes.set(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    loadingNotes.set(false);
  });
});

export const notesByTitle = derived(notes, ($notes) => {
  const map = new Map();
  for (const n of $notes) map.set((n.title || '').toLowerCase(), n);
  return map;
});

export const backlinksMap = derived(notes, ($notes) => {
  const map = new Map();
  for (const n of $notes) {
    const links = extractWikilinks(n.content || '');
    for (const link of links) {
      const key = link.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ id: n.id, title: n.title });
    }
  }
  return map;
});

function currentUid() {
  const u = get(user);
  if (!u) throw new Error('Not signed in');
  return u.uid;
}

export async function createNote({ title = 'Untitled', content = '', folder = 'Notes' } = {}) {
  const uid = currentUid();
  const ref = await addDoc(collection(db, 'users', uid, 'notes'), {
    title, content, folder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  activeNoteId.set(ref.id);
  return ref.id;
}

export async function updateNote(id, data) {
  const uid = currentUid();
  await updateDoc(doc(db, 'users', uid, 'notes', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteNote(id) {
  const uid = currentUid();
  await deleteDoc(doc(db, 'users', uid, 'notes', id));
  if (get(activeNoteId) === id) activeNoteId.set(null);
}