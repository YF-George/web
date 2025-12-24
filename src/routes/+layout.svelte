<script lang="ts">
	import './layout.css';
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
