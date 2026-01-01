<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// 使用 Svelte 5 runes API，移除不正確的 state 匯入
	import { dev } from '$app/environment';
	import '../styles/base.css';
	import '../styles/background.css';
	import '../styles/layout-core.css';
	import '../styles/login.css';
	import '../styles/nav.css';
	import '../styles/cards.css';
	import '../styles/history.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	// theme: 'light' | 'dark'
	let theme = $state<'light' | 'dark'>('light');

	function applyTheme(t: 'light' | 'dark') {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.setAttribute('data-theme', t);
		root.classList.toggle('dark', t === 'dark'); // Tailwind class-based dark mode
		root.style.colorScheme = t;
	}

	function setTheme(t: 'light' | 'dark') {
		theme = t;
		applyTheme(t);
		try {
			localStorage.setItem('theme', t);
		} catch {
			// ignore
		}
	}

	// toggleTheme removed: theme control is exposed via ThemeToggle component

	// In dev mode, enable visual debug outlines to help locate overlays/stacking blocks
	onMount(() => {
		if (dev && typeof document !== 'undefined') {
			document.body.classList.add('debug-top');
		}

		// initialize theme from localStorage or system preference
		if (typeof window !== 'undefined') {
			try {
				const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
				setTheme(saved === 'light' || saved === 'dark' ? saved : 'light');
			} catch {
				setTheme('light');
			}
		}
	});
	onDestroy(() => {
		if (dev && typeof document !== 'undefined') {
			document.body.classList.remove('debug-top');
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="circuit-wrapper" data-theme={theme}>
	<div class="circuit-background"></div>
	<div class="circuit-content">
		{@render children()}
		<!-- Theme toggle moved into the page-specific nav; kept theme init in layout -->
	</div>
</div>
