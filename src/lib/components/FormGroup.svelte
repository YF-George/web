<script lang="ts">
	import type { GroupMember, LocalGroup } from '$lib/types/form-types';
	import MemberRow from './MemberRow.svelte';

	interface Props {
		group: LocalGroup;
		groupIndex: number;
		isAdmin: boolean;
		isReadOnly: boolean;
		onUpdateField: (field: keyof LocalGroup, value: string, callback?: (e: Event) => void) => void;
		onUpdateMember: (
			index: number,
			field: keyof GroupMember,
			value: string | boolean,
			callback?: (e: Event) => void
		) => void;
		onToggleMemberPin: (index: number) => void;
		onToggleMemberCheck: (index: number) => void;
	}

	let {
		group,
		groupIndex,
		isAdmin,
		isReadOnly,
		onUpdateField,
		onUpdateMember,
		onToggleMemberPin,
		onToggleMemberCheck
	}: Props = $props();

	const statusOptions = ['招募中', '已準備', '已出團'];
	const contentTypes = ['王城', '深淵', '副本', '其他'];
</script>

<div class="group-card" data-status={group.status}>
	<div class="group-header">
		<h2 class="group-title">
			<span class="group-badge">團隊 {groupIndex + 1}</span>
			{#if group.dungeonName}
				<span class="dungeon-name">{group.dungeonName}</span>
			{/if}
		</h2>
		<div class="group-meta">
			{#if group.departureDate}
				<span class="meta-item date">
					📅 {group.departureDate}
					{#if group.departureTime}
						{group.departureTime}
					{/if}
				</span>
			{/if}
			<span class="meta-item status" data-status={group.status}>
				{group.status}
			</span>
		</div>
	</div>

	<div class="group-fields">
		<!-- 基本資訊列 -->
		<div class="field-row">
			<label class="field-label">
				<span class="label-text">活動類型</span>
				<select
					class="field-input select"
					value={group.contentType || ''}
					onchange={(e) => onUpdateField('contentType', (e.target as HTMLSelectElement).value)}
					disabled={isReadOnly}
				>
					<option value="">請選擇</option>
					{#each contentTypes as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</label>

			<label class="field-label">
				<span class="label-text">副本/王城名稱</span>
				<input
					type="text"
					class="field-input"
					placeholder="例：古代王城"
					value={group.dungeonName || ''}
					oninput={(e) => onUpdateField('dungeonName', (e.target as HTMLInputElement).value)}
					disabled={isReadOnly}
				/>
			</label>

			<label class="field-label">
				<span class="label-text">等級需求</span>
				<input
					type="number"
					class="field-input"
					placeholder="0-100"
					min="0"
					max="100"
					value={group.level || ''}
					oninput={(e) => {
						const callback = (ev: Event) => {
							const input = ev.target as HTMLInputElement;
							const raw = input.value.trim();
							if (raw === '') return;
							let n = Math.floor(Number(raw));
							if (!Number.isFinite(n)) n = 0;
							n = Math.max(0, Math.min(100, n));
							input.value = String(n);
						};
						onUpdateField('level', (e.target as HTMLInputElement).value);
						callback(e);
					}}
					disabled={isReadOnly}
				/>
			</label>

			<label class="field-label">
				<span class="label-text">裝分需求</span>
				<input
					type="number"
					class="field-input"
					placeholder="0-99999"
					min="0"
					max="99999"
					value={group.gearScoreReq || ''}
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
						onUpdateField('gearScoreReq', (e.target as HTMLInputElement).value);
						callback(e);
					}}
					disabled={isReadOnly}
				/>
			</label>
		</div>

		<!-- 發車時間列 -->
		<div class="field-row">
			<label class="field-label">
				<span class="label-text">發車日期</span>
				<input
					type="date"
					class="field-input"
					value={group.departureDate || ''}
					oninput={(e) => onUpdateField('departureDate', (e.target as HTMLInputElement).value)}
					disabled={isReadOnly}
				/>
			</label>

			<label class="field-label">
				<span class="label-text">發車時間</span>
				<input
					type="time"
					class="field-input"
					value={group.departureTime || ''}
					oninput={(e) => onUpdateField('departureTime', (e.target as HTMLInputElement).value)}
					disabled={isReadOnly}
				/>
			</label>

			<label class="field-label">
				<span class="label-text">狀態</span>
				<select
					class="field-input select"
					value={group.status || '招募中'}
					onchange={(e) => onUpdateField('status', (e.target as HTMLSelectElement).value)}
					disabled={!isAdmin}
				>
					{#each statusOptions as status (status)}
						<option value={status}>{status}</option>
					{/each}
				</select>
			</label>
		</div>

		<!-- 備註 -->
		<label class="field-label full-width">
			<span class="label-text">備註</span>
			<textarea
				class="field-input textarea"
				placeholder="額外說明、注意事項..."
				rows="2"
				value={group.notes || ''}
				oninput={(e) => onUpdateField('notes', (e.target as HTMLTextAreaElement).value)}
				disabled={isReadOnly}
			></textarea>
		</label>
	</div>

	<!-- 成員列表 -->
	<div class="members-section">
		<h3 class="members-title">
			成員列表
			<span class="members-count">
				({(group.members || []).filter((m) => m.playerId?.trim()).length}/{group.members?.length ||
					0})
			</span>
		</h3>

		<div class="members-list" role="list">
			{#each group.members || [] as member, idx (member.id)}
				<MemberRow
					{member}
					memberIndex={idx}
					{isAdmin}
					{isReadOnly}
					onUpdate={(field, value, callback) => onUpdateMember(idx, field, value, callback)}
					onTogglePin={() => onToggleMemberPin(idx)}
					onToggleCheck={() => onToggleMemberCheck(idx)}
				/>
			{/each}
		</div>
	</div>
</div>

<style>
	.group-card {
		background: var(--surface);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: var(--card-shadow);
		transition: all 0.2s ease;
	}

	.group-card[data-status='已準備'] {
		border-left: 4px solid var(--accent-green-start);
	}

	.group-card[data-status='已出團'] {
		border-left: 4px solid var(--muted);
		opacity: 0.75;
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.group-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.group-badge {
		background: linear-gradient(135deg, var(--accent-blue-start), var(--accent-blue-end));
		color: white;
		padding: 0.35rem 0.85rem;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.dungeon-name {
		color: var(--dungeon-color);
		font-weight: 600;
	}

	.group-meta {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.meta-item {
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.meta-item.date {
		background: var(--team-bg);
		color: var(--team-color);
	}

	.meta-item.status {
		color: white;
	}

	.meta-item.status[data-status='招募中'] {
		background: linear-gradient(135deg, var(--accent-blue-start), var(--accent-blue-end));
	}

	.meta-item.status[data-status='已準備'] {
		background: linear-gradient(135deg, var(--accent-green-start), var(--accent-green-end));
	}

	.meta-item.status[data-status='已出團'] {
		background: var(--muted);
	}

	.group-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.field-label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field-label.full-width {
		grid-column: 1 / -1;
	}

	.label-text {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--field-label);
	}

	.field-input {
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--input-surface);
		color: var(--text);
		font-size: 0.95rem;
		transition: all 0.2s ease;
	}

	input[type='date'].field-input,
	input[type='time'].field-input {
		color-scheme: light dark; /* let native pickers follow theme */
	}

	.field-input:focus {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
	}

	.field-input:disabled {
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		cursor: not-allowed;
		opacity: 0.6;
	}

	.field-input.select {
		cursor: pointer;
	}

	.field-input.textarea {
		resize: vertical;
		min-height: 60px;
		font-family: inherit;
	}

	.members-section {
		margin-top: 1.5rem;
	}

	.members-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 1rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.members-count {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--muted);
	}

	.members-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	@media (max-width: 768px) {
		.field-row {
			grid-template-columns: 1fr;
		}

		.group-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
