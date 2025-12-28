<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	export let value: string | null = null;
	export let disabled: boolean = false;
	export let options: { value: string; label?: string; color?: string }[] = [
		{ value: '坦克', label: '坦克', color: '#f5a839' },
		{ value: '治療', label: '治療', color: '#22bf58' },
		{ value: '輸出', label: '輸出', color: '#60a5fa' }
	];

	// helper: determine readable text color (black or white) for a background HEX
	function readableTextColor(hex: string | undefined) {
		if (!hex) return '#000';
		const h = hex.replace('#', '').trim();
		if (h.length === 3) {
			const r = parseInt(h[0] + h[0], 16);
			const g = parseInt(h[1] + h[1], 16);
			const b = parseInt(h[2] + h[2], 16);
			const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
			return lum > 0.5 ? '#000' : '#fff';
		}
		if (h.length === 6) {
			const r = parseInt(h.slice(0, 2), 16);
			const g = parseInt(h.slice(2, 4), 16);
			const b = parseInt(h.slice(4, 6), 16);
			const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
			return lum > 0.5 ? '#000' : '#fff';
		}
		return '#000';
	}

	$: selectedOption = options.find((o) => o.value === value);

	const dispatch = createEventDispatcher();
	let open = false;
	let focusedIndex = -1;
	let buttonEl: HTMLButtonElement | null = null;
	let listEl: HTMLElement | null = null;
	let isDark = false;
	let themeObserver: MutationObserver | null = null;

	function toggle() {
		if (disabled) return;
		open = !open;
		if (open) {
			focusedIndex = options.findIndex((o) => o.value === value);
			// focus the list for keyboard handling
			setTimeout(() => listEl?.focus());
		}
	}

	function selectOption(opt: { value: string }) {
		// close first to avoid re-opening during parent updates
		open = false;
		value = opt.value;
		dispatch('change', value);
		// ensure focus returns to the button for accessibility
		setTimeout(() => buttonEl?.focus());
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
			scrollFocusedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
			scrollFocusedIntoView();
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (focusedIndex >= 0) selectOption(options[focusedIndex]);
		} else if (e.key === 'Escape') {
			open = false;
			buttonEl?.focus();
		}
	}

	function scrollFocusedIntoView() {
		const el = listEl?.querySelectorAll('[role="option"]')[focusedIndex] as HTMLElement | undefined;
		el?.scrollIntoView({ block: 'nearest' });
	}

	onMount(() => {
		if (value == null && options.length > 0) {
			value = options[0].value;
			dispatch('change', value);
		}
		// SSR-safe theme detection and live updates
		if (typeof document !== 'undefined') {
			const themeAttr = document.documentElement.getAttribute('data-theme');
			isDark = themeAttr === 'dark';
			// observe changes to data-theme so component updates when theme toggles
			themeObserver = new MutationObserver(() => {
				const t = document.documentElement.getAttribute('data-theme');
				isDark = t === 'dark';
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-theme']
			});
		}
	});

	onDestroy(() => {
		themeObserver?.disconnect();
	});
</script>

<div class="profession-select">
	<button
		class="ps-button"
		class:has-value={selectedOption}
		style={selectedOption
			? `--selected-color: ${selectedOption.color}; color: ${isDark ? '#fff' : readableTextColor(selectedOption.color)}`
			: ''}
		aria-haspopup="listbox"
		aria-expanded={open}
		on:click={toggle}
		bind:this={buttonEl}
		type="button"
		{disabled}
	>
		<span class="ps-current">
			{#if value}
				{value}
			{/if}
		</span>
		<svg class="ps-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M6 9l6 6 6-6"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	{#if open}
		<ul class="ps-list" role="listbox" tabindex="0" on:keydown={onKeydown} bind:this={listEl}>
			{#each options as opt, i (opt.value)}
				<li
					role="option"
					data-value={opt.value}
					aria-selected={opt.value === value}
					class:selected={opt.value === value}
					class:focused={i === focusedIndex}
					tabindex="0"
					on:click={(e) => {
						e.stopPropagation();
						e.preventDefault();
						selectOption(opt);
					}}
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							e.stopPropagation();
							selectOption(opt);
						}
					}}
				>
					<span
						class="opt-bg"
						style={`--opt-color: ${opt.color}; color: ${isDark ? '#fff' : readableTextColor(opt.color)}`}
					>
						{opt.label ?? opt.value}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.profession-select {
		position: relative;
		display: inline-block;
		min-width: 160px;
		font-size: 0.95rem;
	}

	.ps-button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--text, #111);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.95rem;
		box-sizing: border-box;
	}

	.ps-button:focus {
		outline: 2px solid color-mix(in srgb, var(--text, #111) 20%, transparent);
		outline-offset: 2px;
	}

	.ps-button[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.ps-list {
		position: absolute;
		z-index: 60;
		margin: 0.35rem 0 0 0;
		padding: 0.25rem;
		list-style: none;
		/* remove outer frame: transparent background, no border/shadow */
		background: transparent;
		border: none;
		border-radius: 8px;
		box-shadow: none;
		max-height: 220px;
		overflow: auto;
	}

	.ps-list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
		cursor: pointer;
		border-radius: 6px;
	}

	.ps-list li:hover,
	.ps-list li.focused {
		background: color-mix(in srgb, var(--text, #111) 6%, transparent);
	}

	.ps-list li.selected {
		font-weight: 700;
	}

	/* pill styling when a profession is selected */
	.ps-button.has-value {
		/* keep same vertical size as inputs while appearing as a pill */
		padding: 0.6rem 0.75rem;
		background: var(--selected-color);
	}

	.opt-bg {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-weight: 600;
		background: var(--opt-color);
	}

	/* dark theme overrides */
	:global(html[data-theme='dark']) .ps-button.has-value {
		background: color-mix(in srgb, var(--selected-color) 50%, black 50%);
		color: #fff;
	}

	:global(html[data-theme='dark']) .opt-bg {
		background: color-mix(in srgb, var(--opt-color) 80%, black 50%);
		color: #fff;
	}

	:global(html[data-theme='dark']) .ps-list {
		background: #0b1220;
		border-color: #1f2937;
		color: #e6eef8;
	}
</style>
