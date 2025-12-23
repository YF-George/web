<script lang="ts">
	import { onMount } from 'svelte';
	// import { page } from '$app/stores';

	interface Edit {
		id: string;
		formId: string;
		displayName: string;
		action: {
			type: string;
			row?: number;
			col?: number;
			value?: string;
			cellAddress?: string;
			timestamp?: number;
		};
		created_at: string;
	}

	let edits = $state<Edit[]>([]);
	let loading = $state(false);
	let filter = $state<'all' | 'cell-edit'>('all');

	const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

	function getCellAddress(row: number, col: number): string {
		return `${COL_LABELS[col]}${row + 1}`;
	}

	async function loadHistory() {
		loading = true;
		try {
			const res = await fetch(`/api/edits?formId=main`);
			if (res.ok) {
				const data = await res.json();
				edits = data.edits || [];
			}
		} catch (e) {
			console.error('Failed to load history:', e);
		} finally {
			loading = false;
		}
	}

	function formatDate(iso: string) {
		if (!iso) return '';
		const d = new Date(iso);
		return d.toLocaleString('zh-TW', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatRelativeTime(iso: string) {
		if (!iso) return '';
		const d = new Date(iso);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '剛剛';
		if (minutes < 60) return `${minutes}分前`;
		if (hours < 24) return `${hours}小時前`;
		if (days < 30) return `${days}天前`;
		return formatDate(iso);
	}

	const filteredEdits = $derived(
		filter === 'all' ? edits : edits.filter((e) => e.action.type === filter)
	);

	onMount(() => {
		loadHistory();
		const interval = setInterval(loadHistory, 30000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>編輯記錄 - 匿名協作試算表</title>
</svelte:head>

<div class="container">
	<header>
		<div class="header-top">
			<h1>📜 編輯記錄</h1>
			<div class="header-actions">
				<a data-sveltekit-preload-data href="/forms/main" class="btn-back">← 返回試算表</a>
				<button class="btn-refresh" onclick={loadHistory} disabled={loading}>
					{loading ? '⏳' : '🔄'}
				</button>
			</div>
		</div>
		<p class="description">查看所有協作者的編輯歷史</p>
	</header>

	<div class="filters">
		<button class="filter-btn" class:active={filter === 'all'} onclick={() => (filter = 'all')}>
			全部 ({edits.length})
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'cell-edit'}
			onclick={() => (filter = 'cell-edit')}
		>
			儲存格編輯 ({edits.filter((e) => e.action.type === 'cell-edit').length})
		</button>
	</div>

	<div class="content">
		{#if loading && edits.length === 0}
			<div class="empty">
				<div class="spinner"></div>
				<p>載入中...</p>
			</div>
		{:else if filteredEdits.length === 0}
			<div class="empty">
				<p>📭 尚無編輯記錄</p>
			</div>
		{:else}
			<div class="timeline">
				{#each filteredEdits.toReversed() as edit (edit.id)}
					<div class="timeline-item">
						<div class="timeline-marker"></div>
						<div class="timeline-content">
							<div class="edit-header">
								<span class="author">{edit.displayName}</span>
								<span class="time" title={formatDate(edit.created_at)}>
									{formatRelativeTime(edit.created_at)}
								</span>
							</div>

							{#if edit.action.type === 'cell-edit'}
								<div class="edit-body cell-edit">
									<span class="cell-address">
										{edit.action.cellAddress ||
											getCellAddress(edit.action.row || 0, edit.action.col || 0)}
									</span>
									<span class="arrow">→</span>
									<span class="cell-value">{edit.action.value || '(清空)'}</span>
								</div>
							{:else}
								<div class="edit-body text-edit">
									{edit.action.value || ''}
								</div>
							{/if}

							<div class="edit-footer">
								<span class="edit-id">#{edit.id}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: #f5f5f5;
		color: #333;
	}

	.container {
		max-width: 1000px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	header {
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		margin-bottom: 1.5rem;
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		color: #1a1a1a;
	}

	.description {
		margin: 0;
		color: #666;
		font-size: 0.95rem;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.btn-back {
		padding: 0.6rem 1.25rem;
		background: #4a90e2;
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9rem;
		transition: background 0.2s;
	}

	.btn-back:hover {
		background: #357abd;
	}

	.btn-refresh {
		padding: 0.6rem 0.9rem;
		border: none;
		background: #f0f0f0;
		border-radius: 8px;
		font-size: 1.2rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-refresh:hover:not(:disabled) {
		background: #e0e0e0;
	}

	.btn-refresh:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.filters {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.filter-btn {
		padding: 0.75rem 1.5rem;
		border: 2px solid #e0e0e0;
		background: white;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.filter-btn:hover {
		border-color: #4a90e2;
	}

	.filter-btn.active {
		background: #4a90e2;
		color: white;
		border-color: #4a90e2;
	}

	.content {
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		min-height: 400px;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		color: #999;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #f0f0f0;
		border-top-color: #4a90e2;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.timeline {
		position: relative;
		padding-left: 2rem;
	}

	.timeline::before {
		content: '';
		position: absolute;
		left: 8px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: #e0e0e0;
	}

	.timeline-item {
		position: relative;
		padding-bottom: 2rem;
	}

	.timeline-item:last-child {
		padding-bottom: 0;
	}

	.timeline-marker {
		position: absolute;
		left: -1.5rem;
		top: 6px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #4a90e2;
		border: 3px solid white;
		box-shadow: 0 0 0 2px #4a90e2;
	}

	.timeline-content {
		background: #f9f9f9;
		padding: 1.25rem;
		border-radius: 8px;
		border-left: 3px solid #4a90e2;
	}

	.edit-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.author {
		font-weight: 700;
		font-size: 1.05rem;
		color: #4a90e2;
	}

	.time {
		font-size: 0.85rem;
		color: #999;
	}

	.edit-body {
		margin-bottom: 0.75rem;
	}

	.cell-edit {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: 'Courier New', monospace;
	}

	.cell-address {
		padding: 0.4rem 0.75rem;
		background: #e3f2fd;
		color: #1976d2;
		border-radius: 6px;
		font-weight: 700;
		font-size: 0.95rem;
	}

	.arrow {
		color: #999;
		font-size: 1.2rem;
	}

	.cell-value {
		flex: 1;
		padding: 0.4rem 0.75rem;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.text-edit {
		padding: 0.75rem;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.6;
	}

	.edit-footer {
		display: flex;
		justify-content: flex-end;
	}

	.edit-id {
		font-size: 0.75rem;
		color: #bbb;
		font-family: 'Courier New', monospace;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		.header-top {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.filters {
			flex-direction: column;
		}

		.filter-btn {
			width: 100%;
		}

		.cell-edit {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
