<script>
  import { login } from '$lib/stores/auth';
</script>

<div class="login-screen">
  <h1>Writer</h1>
  <p>Sign in</p>
  <button onclick={login}>Login with Google</button>
</div>

<style>
  .login-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: #181818; color: #eee; }
  button { padding: 10px 20px; background: #7dabf8; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; }
</style>