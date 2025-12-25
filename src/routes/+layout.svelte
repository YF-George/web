<script lang="ts">
	import '../styles/base.css';
	import '../styles/background.css';
	import '../styles/layout-core.css';
	import '../styles/login.css';
	import '../styles/nav.css';
	import '../styles/cards.css';
	import '../styles/history.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="circuit-wrapper">
	<div class="circuit-background"></div>
	<div class="circuit-content">
		{@render children()}
	</div>
</div>
