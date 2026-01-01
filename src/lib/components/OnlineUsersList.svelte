<script lang="ts">
	interface OnlineUser {
		connectionId?: number;
		id?: string;
		name: string;
		isAdmin?: boolean;
	}

	interface Props {
		users: OnlineUser[];
		currentUserId: string;
		isCurrentUserAdmin: boolean;
		onKickUser?: (name: string) => void;
	}

	let { users, currentUserId, isCurrentUserAdmin, onKickUser }: Props = $props();

	function handleKick(userName: string) {
		if (!isCurrentUserAdmin || !onKickUser) return;
		if (confirm(`確定要踢出「${userName}」嗎？`)) {
			onKickUser(userName);
		}
	}
</script>

<div class="online-panel" role="dialog" aria-label="線上使用者清單">
	<div class="panel-header">
		<h3 class="panel-title">線上使用者</h3>
		<span class="panel-count">{users.length} 人</span>
	</div>

	{#if users.length === 0}
		<div class="empty-state">
			<p class="empty-text">目前無其他使用者在線</p>
		</div>
	{:else}
		<ul class="users-list" role="list">
			{#each users as user (user.connectionId || user.id || user.name)}
				<li class="user-item" role="listitem">
					<div class="user-info">
						<span class="user-icon" aria-hidden="true">
							{user.isAdmin ? '👑' : '👤'}
						</span>
						<span
							class="user-name"
							class:admin={user.isAdmin}
							class:current={user.name === currentUserId}
						>
							{user.name}
							{#if user.name === currentUserId}
								<span class="badge-self">(自己)</span>
							{/if}
						</span>
					</div>

					{#if isCurrentUserAdmin && user.name !== currentUserId && !user.isAdmin && onKickUser}
						<button
							class="kick-btn"
							onclick={() => handleKick(user.name)}
							title={`踢出 ${user.name}`}
							aria-label={`踢出 ${user.name}`}
						>
							移除
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.online-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		min-width: 280px;
		max-width: 360px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
		padding: 1rem;
		z-index: 100;
		animation: slideDown 0.2s ease;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 2px solid var(--border);
	}

	.panel-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text);
	}

	.panel-count {
		padding: 0.25rem 0.6rem;
		background: var(--team-bg);
		color: var(--team-color);
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.empty-state {
		padding: 2rem 1rem;
		text-align: center;
	}

	.empty-text {
		margin: 0;
		color: var(--muted);
		font-size: 0.95rem;
	}

	.users-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 300px;
		overflow-y: auto;
	}

	.user-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: var(--input-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.user-item:hover {
		border-color: var(--primary);
		box-shadow: 0 2px 6px color-mix(in srgb, var(--primary) 10%, transparent);
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.user-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.user-name {
		font-weight: 600;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-name.admin {
		color: var(--accent-red-start);
	}

	.user-name.current {
		color: var(--primary);
	}

	.badge-self {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--muted);
		margin-left: 0.25rem;
	}

	.kick-btn {
		padding: 0.35rem 0.75rem;
		background: linear-gradient(135deg, var(--accent-red-start), var(--accent-red-end));
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.kick-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-red-start) 30%, transparent);
	}

	.kick-btn:active {
		transform: translateY(0);
	}

	.kick-btn:focus {
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-red-start) 20%, transparent);
	}

	/* 滾動條樣式 */
	.users-list::-webkit-scrollbar {
		width: 6px;
	}

	.users-list::-webkit-scrollbar-track {
		background: var(--surface);
		border-radius: 3px;
	}

	.users-list::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 3px;
	}

	.users-list::-webkit-scrollbar-thumb:hover {
		background: var(--primary);
	}

	@media (max-width: 768px) {
		.online-panel {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			right: auto;
			max-width: 90%;
			max-height: 80vh;
		}

		@keyframes slideDown {
			from {
				opacity: 0;
				transform: translate(-50%, calc(-50% - 8px));
			}
			to {
				opacity: 1;
				transform: translate(-50%, -50%);
			}
		}
	}
</style>
