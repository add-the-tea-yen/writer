<script>
  import '../app.css';
  export const ssr = false;
  export const prerender = true;
  let { children } = $props();
</script>

{@render children?.()}