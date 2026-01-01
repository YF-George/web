<script lang="ts">
	import type { GroupMember } from '$lib/types/form-types';
	import ProfessionSelect from '$lib/ProfessionSelect.svelte';

	interface Props {
		member: GroupMember;
		memberIndex: number;
		isAdmin: boolean;
		isReadOnly: boolean;
		onUpdate: (
			field: keyof GroupMember,
			value: string | boolean,
			callback?: (e: Event) => void
		) => void;
		onTogglePin: () => void;
		onToggleCheck: () => void;
	}

	let { member, memberIndex, isAdmin, isReadOnly, onUpdate, onTogglePin, onToggleCheck }: Props =
		$props();

	const roleOptions = [
		{ value: '', label: '無' },
		{ value: 'leader', label: '隊長' },
		{ value: 'helper', label: '幫打' }
	];
</script>

<div
	class="member-row"
	class:pinned={member.pinned}
	class:checked={member.checked}
	role="listitem"
	aria-label={`成員 ${memberIndex + 1}`}
>
	<div class="member-index">{memberIndex + 1}</div>

	<div class="member-controls">
		<button
			class="control-btn pin-btn"
			class:active={member.pinned}
			onclick={onTogglePin}
			title={member.pinned ? '取消鎖定' : '鎖定此成員'}
			aria-label={member.pinned ? '取消鎖定' : '鎖定此成員'}
			aria-pressed={member.pinned}
		>
			{member.pinned ? '🔒' : '🔓'}
		</button>

		{#if isAdmin}
			<button
				class="control-btn check-btn"
				class:active={member.checked}
				onclick={onToggleCheck}
				title={member.checked ? '取消勾選' : '勾選'}
				aria-label={member.checked ? '取消勾選' : '勾選'}
				aria-pressed={member.checked}
			>
				{member.checked ? '✓' : '○'}
			</button>
		{/if}
	</div>

	<div class="member-field profession">
		<label class="sr-only" for={`profession-${member.id}`}>職業</label>
		<ProfessionSelect
			value={member.profession}
			disabled={isReadOnly}
			on:change={(e) => onUpdate('profession', e.detail)}
		/>
	</div>

	<div class="member-field role">
		<label class="sr-only" for={`role-${member.id}`}>角色</label>
		<select
			id={`role-${member.id}`}
			class="field-input select-sm"
			value={member.role || ''}
			onchange={(e) => onUpdate('role', (e.target as HTMLSelectElement).value)}
			disabled={isReadOnly}
			aria-label="角色"
		>
			{#each roleOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<div class="member-field player-id">
		<label class="sr-only" for={`playerId-${member.id}`}>玩家暱稱</label>
		<input
			id={`playerId-${member.id}`}
			type="text"
			class="field-input"
			placeholder="玩家暱稱"
			value={member.playerId || ''}
			oninput={(e) => onUpdate('playerId', (e.target as HTMLInputElement).value)}
			disabled={isReadOnly}
			aria-label="玩家暱稱"
		/>
	</div>

	<div class="member-field gear-score">
		<label class="sr-only" for={`gearScore-${member.id}`}>裝備分數</label>
		<input
			id={`gearScore-${member.id}`}
			type="number"
			class="field-input"
			placeholder="裝分"
			min="0"
			max="99999"
			value={member.gearScore || ''}
			oninput={(e) => {
				const callback = (ev: Event) => {
					const input = ev.target as HTMLInputElement;
					const raw = input.value.trim();
					if (raw === '') return;
					let n = Math.floor(Number(raw));
					if (!Number.isFinite(n)) n = 0;
					n = Math.max(0, Math.min(99999, n));
					input.value = String(n);
				};
				onUpdate('gearScore', (e.target as HTMLInputElement).value);
				callback(e);
			}}
			disabled={isReadOnly}
			aria-label="裝備分數"
		/>
	</div>
</div>

<style>
	.member-row {
		display: grid;
		grid-template-columns: 40px auto 1fr 100px 1.5fr 120px;
		gap: 0.75rem;
		align-items: center;
		padding: 0.75rem;
		background: var(--input-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.member-row:hover {
		border-color: var(--primary);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 10%, transparent);
	}

	.member-row.pinned {
		background: color-mix(in srgb, var(--accent-yellow-start) 8%, var(--input-surface));
		border-color: var(--accent-yellow-start);
	}

	.member-row.checked {
		background: color-mix(in srgb, var(--accent-green-start) 5%, var(--input-surface));
	}

	.member-index {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: linear-gradient(135deg, var(--accent-blue-start), var(--accent-blue-end));
		color: white;
		border-radius: 6px;
		font-weight: 700;
		font-size: 0.9rem;
	}

	.member-controls {
		display: flex;
		gap: 0.25rem;
	}

	.control-btn {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.control-btn:hover {
		background: var(--primary);
		color: white;
		border-color: var(--primary);
		transform: translateY(-1px);
	}

	.control-btn.active {
		background: linear-gradient(135deg, var(--accent-yellow-start), var(--accent-yellow-end));
		color: white;
		border-color: var(--accent-yellow-start);
	}

	.check-btn.active {
		background: linear-gradient(135deg, var(--accent-green-start), var(--accent-green-end));
		border-color: var(--accent-green-start);
	}

	.control-btn:focus {
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.member-field {
		min-width: 0; /* 防止 grid 溢出 */
	}

	.field-input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
	}

	.field-input:disabled {
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		cursor: not-allowed;
		opacity: 0.6;
	}

	.field-input.select-sm {
		cursor: pointer;
		font-size: 0.85rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	/* 響應式調整 */
	@media (max-width: 1024px) {
		.member-row {
			grid-template-columns: 40px auto 1fr 80px 1.2fr 100px;
			gap: 0.5rem;
		}

		.field-input {
			font-size: 0.85rem;
			padding: 0.45rem 0.5rem;
		}
	}

	@media (max-width: 768px) {
		.member-row {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.member-controls {
			order: -1;
		}

		.member-field {
			width: 100%;
		}
	}
</style>
