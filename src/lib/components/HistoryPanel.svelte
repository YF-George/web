<script lang="ts">
	import type { ChangeLog } from '$lib/types/form-types';

	interface Props {
		changeLogs: ChangeLog[];
		groupId?: string; // 若提供則僅顯示該團隊的紀錄
	}

	let { changeLogs, groupId }: Props = $props();

	// 過濾與排序
	const filteredLogs = $derived(
		(groupId
			? changeLogs.filter((log) => log.targetId === groupId || log.targetType === 'group')
			: changeLogs
		)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
			.slice(0, 100) // 最多顯示 100 筆
	);

	// 格式化時間
	function formatTimestamp(date: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hours = pad(date.getHours());
		const minutes = pad(date.getMinutes());
		const seconds = pad(date.getSeconds());
		return `${month}/${day} ${hours}:${minutes}:${seconds}`;
	}

	// 根據操作類型決定圖示
	function getActionIcon(action: string): string {
		if (action.includes('建立')) return '➕';
		if (action.includes('刪除')) return '🗑️';
		if (action.includes('更新')) return '✏️';
		if (action.includes('清空')) return '🧹';
		return '📝';
	}
</script>

<div class="history-panel" role="region" aria-label="變更紀錄">
	<div class="history-header">
		<h2 class="history-title">變更紀錄</h2>
		<span class="history-count">{filteredLogs.length} 筆</span>
	</div>

	{#if filteredLogs.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📋</div>
			<p class="empty-text">目前無變更紀錄</p>
		</div>
	{:else}
		<div class="history-list" role="list">
			{#each filteredLogs as log (log.id)}
				<div class="history-item" role="listitem">
					<div class="log-icon" aria-hidden="true">{getActionIcon(log.action)}</div>
					<div class="log-content">
						<div class="log-header">
							<span class="log-action">{log.action}</span>
							<span class="log-time">
								<time datetime={log.timestamp.toISOString()}>
									{formatTimestamp(log.timestamp)}
								</time>
							</span>
						</div>
						<div class="log-details">{log.details}</div>
						{#if log.actorId && log.actorId !== 'system'}
							<div class="log-actor">
								<span class="actor-label">操作者：</span>
								<span class="actor-name">{log.actorId}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.history-panel {
		background: var(--surface);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: var(--card-shadow);
		max-height: 600px;
		display: flex;
		flex-direction: column;
	}

	.history-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--border);
	}

	.history-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.history-count {
		padding: 0.35rem 0.75rem;
		background: var(--team-bg);
		color: var(--team-color);
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-text {
		color: var(--muted);
		font-size: 1.1rem;
		margin: 0;
	}

	.history-list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.history-item {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--input-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.history-item:hover {
		border-color: var(--primary);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 10%, transparent);
		transform: translateX(4px);
	}

	.log-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, var(--accent-blue-start), var(--accent-blue-end));
		color: white;
		border-radius: 8px;
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.log-content {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.log-action {
		font-weight: 700;
		color: var(--text);
		font-size: 1rem;
	}

	.log-time {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 500;
	}

	.log-details {
		color: var(--field-value);
		font-size: 0.95rem;
		line-height: 1.5;
		word-break: break-word;
	}

	.log-actor {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		margin-top: 0.25rem;
	}

	.actor-label {
		color: var(--muted);
		font-weight: 500;
	}

	.actor-name {
		padding: 0.2rem 0.5rem;
		background: var(--name-bg);
		color: var(--name-text);
		border-radius: 4px;
		font-weight: 600;
	}

	/* 滾動條樣式 */
	.history-list::-webkit-scrollbar {
		width: 8px;
	}

	.history-list::-webkit-scrollbar-track {
		background: var(--surface);
		border-radius: 4px;
	}

	.history-list::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 4px;
	}

	.history-list::-webkit-scrollbar-thumb:hover {
		background: var(--primary);
	}

	@media (max-width: 768px) {
		.history-panel {
			padding: 1rem;
		}

		.history-item {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.log-icon {
			width: 32px;
			height: 32px;
			font-size: 1.2rem;
		}

		.log-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
