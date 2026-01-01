<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const THEME_KEY = 'theme';
	export let theme: 'light' | 'dark' = 'light';

	function applyTheme(t: 'light' | 'dark') {
		if (!browser) return;
		const root = document.documentElement;
		root.dataset.theme = t;
		root.classList.toggle('dark', t === 'dark'); // Tailwind manual dark mode class
		root.style.colorScheme = t;
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

	// react to prop changes from parent (e.g. bind:theme)
	$: if (browser) applyTheme(theme);

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
