<script lang="ts">
	interface Props {
		value: string;
		rowIndex: number;
		colIndex: number;
		isEditing: boolean;
		isSelected?: boolean;
		onEdit: (row: number, col: number) => void;
		onSelect?: (row: number, col: number) => void;
		onSave: (row: number, col: number, value: string) => void;
		// Formatting properties
		textColor?: string;
		bgColor?: string;
		fontWeight?: string;
		fontStyle?: string;
		textDecoration?: string;
		fontSize?: string;
		textAlign?: string;
	}

	let {
		value = '',
		rowIndex,
		colIndex,
		isEditing,
		isSelected = false,
		onEdit,
		onSelect,
		onSave,
		textColor,
		bgColor,
		fontWeight = 'normal',
		fontStyle = 'normal',
		textDecoration = 'none',
		fontSize = '14px',
		textAlign = 'left'
	}: Props = $props();

	let editValue = $derived(value);
	let inputElement = $state<HTMLInputElement | undefined>(undefined);

	$effect(() => {
		if (isEditing && inputElement) {
			inputElement.focus();
			inputElement.select();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			save();
		} else if (e.key === 'Escape') {
			editValue = value;
			onEdit(-1, -1);
		}
	}

	function save() {
		if (editValue !== value) {
			onSave(rowIndex, colIndex, editValue);
		}
		onEdit(-1, -1);
	}

	function handleClick() {
		if (onSelect) {
			onSelect(rowIndex, colIndex);
		}
	}

	// Build inline style for the cell
	let cellStyle = $derived(
		[
			textColor ? `color: ${textColor}` : '',
			bgColor ? `background-color: ${bgColor}` : '',
			fontWeight ? `font-weight: ${fontWeight}` : '',
			fontStyle ? `font-style: ${fontStyle}` : '',
			textDecoration ? `text-decoration: ${textDecoration}` : '',
			fontSize ? `font-size: ${fontSize}` : '',
			textAlign ? `text-align: ${textAlign}` : ''
		]
			.filter(Boolean)
			.join('; ')
	);
</script>

<div
	class="cell"
	class:editing={isEditing}
	class:selected={isSelected}
	style={cellStyle}
	ondblclick={() => onEdit(rowIndex, colIndex)}
	onclick={handleClick}
	role="gridcell"
	tabindex={0}
	onkeydown={(e) => {
		if (e.key === 'Enter' && !isEditing) {
			onEdit(rowIndex, colIndex);
		}
	}}
>
	{#if isEditing}
		<input
			bind:this={inputElement}
			bind:value={editValue}
			onkeydown={handleKeydown}
			onblur={save}
			type="text"
		/>
	{:else}
		<span class="cell-value">{value || ''}</span>
	{/if}
</div>

<style>
	.cell {
		display: table-cell;
		border: 1px solid #e0e0e0;
		padding: 0.5rem;
		min-height: 36px;
		min-width: 100px;
		max-width: 200px;
		background: white;
		cursor: cell;
		position: relative;
		transition: all 0.1s;
		vertical-align: middle;
	}

	.cell:hover {
		background: #f5f5f5;
	}

	.cell.editing {
		background: white !important;
		border: 2px solid #4a90e2;
		z-index: 10;
	}

	.cell.selected {
		outline: 2px solid #4a90e2;
		outline-offset: -2px;
		z-index: 5;
	}

	.cell-value {
		display: block;
		white-space: pre-wrap;
		word-break: break-word;
	}

	input {
		width: 100%;
		border: none;
		outline: none;
		padding: 0;
		font-family: inherit;
		font-size: inherit;
		background: transparent;
	}
</style>
