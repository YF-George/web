<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(async () => {
		// Auto-redirect to the single fixed form
		await goto('/forms/main', { noscroll: true });
	});
</script>

<svelte:head>
	<title>匿名協作表單系統</title>
</svelte:head>

<div class="container">
	<div class="loading">
		<div class="spinner"></div>
		<p>載入中...</p>
	</div>
</div>

<style>
	.container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.loading {
		text-align: center;
		color: white;
	}

	.spinner {
		width: 50px;
		height: 50px;
		margin: 0 auto 1rem;
		border: 4px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	p {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 500;
	}
</style>
