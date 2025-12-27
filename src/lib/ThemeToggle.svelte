<script lang="ts">
	import { onMount } from 'svelte';

	const THEME_KEY = 'theme';
	let theme: 'light' | 'dark' = 'light';

	function applyTheme(t: 'light' | 'dark') {
		if (t === 'dark') {
			document.documentElement.dataset.theme = 'dark';
		} else {
			delete document.documentElement.dataset.theme;
		}
	}

	onMount(() => {
		try {
			const saved = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
			if (saved === 'dark' || saved === 'light') theme = saved;
		} catch {
			/* ignore localStorage errors */
		}
		applyTheme(theme);
	});

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {
			/* ignore */
		}
		applyTheme(theme);
	}
</script>

<button class="theme-toggle btn-accent-outline" aria-pressed={theme === 'dark'} on:click={toggle}>
	{#if theme === 'dark'}
		☀️
	{:else}
		🌙
	{/if}
</button>

<style>
	/* Component-local tweaks: ensure the button looks good in headers */
	:global(.theme-toggle) {
		font-size: 0.9rem;
	}
</style>
