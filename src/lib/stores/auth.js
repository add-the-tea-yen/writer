import { writable } from 'svelte/store';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '$lib/firebase';

export const user = writable(null);
export const authLoading = writable(true);

onAuthStateChanged(auth, (u) => {
  user.set(u);
  authLoading.set(false);
});

export async function login() {
  await signInWithPopup(auth, googleProvider);
}

export async function logout() {
  await signOut(auth);
}