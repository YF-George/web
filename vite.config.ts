import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			// Treat platform-only runtime modules as external so Rollup won't try to bundle them.
			// This covers @vercel/* and @liveblocks/node which are intended for server/runtime.
			external: (id: string) => id.startsWith('@vercel/kv') || id === '@liveblocks/node'
		}
	}
});
