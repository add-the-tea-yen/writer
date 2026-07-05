import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

const config = {
  preprocess: vitePreprocess(),
  kit: {
    paths: {
      base: dev ? '' : '/writer'
    }
  }
};

export default config;