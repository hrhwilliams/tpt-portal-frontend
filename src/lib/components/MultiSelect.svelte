<script lang="ts">
	/**
	 * Checkbox dropdown with type-to-filter. Selected values OR together.
	 *
	 * A real <button aria-expanded> and native checkboxes rather than a tabindex
	 * div, so keyboard and screen-reader use work without extra handling.
	 */
	export type Option = { value: string; label: string; hint?: string };

	let {
		selected = $bindable(),
		options,
		placeholder = 'Select…',
		filterPlaceholder = 'Type to filter…',
		id
	}: {
		selected: string[];
		options: Option[];
		placeholder?: string;
		filterPlaceholder?: string;
		id: string;
	} = $props();

	let open = $state(false);
	let filter = $state('');
	let root: HTMLDivElement | undefined = $state();

	const shown = $derived.by(() => {
		const f = filter.trim().toLowerCase();
		if (!f) return options;
		return options.filter(
			(o) => o.label.toLowerCase().includes(f) || o.value.toLowerCase().includes(f)
		);
	});

	const label = $derived(
		selected.length === 0
			? placeholder
			: selected.length === 1
				? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
				: `${selected.length} selected`
	);

	function toggle(value: string) {
		selected = selected.includes(value)
			? selected.filter((v) => v !== value)
			: [...selected, value];
	}

	function close() {
		open = false;
		filter = '';
	}

	function onDocPointerDown(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}
</script>

<svelte:document onpointerdown={onDocPointerDown} />

<div class="ms" bind:this={root}>
	<button
		type="button"
		class="trigger"
		aria-expanded={open}
		aria-controls={`${id}-list`}
		onclick={() => (open = !open)}
		onkeydown={(e) => e.key === 'Escape' && close()}
	>
		<span class="label" class:placeholder={selected.length === 0}>{label}</span>
		{#if selected.length > 1}<span class="badge">{selected.length}</span>{/if}
		<span class="caret" aria-hidden="true">▾</span>
	</button>

	{#if open}
		<div class="panel" id={`${id}-list`}>
			<input
				type="text"
				class="filter"
				bind:value={filter}
				placeholder={filterPlaceholder}
				onkeydown={(e) => e.key === 'Escape' && close()}
			/>
			{#if selected.length}
				<button type="button" class="clear" onclick={() => (selected = [])}>
					Clear {selected.length} selected
				</button>
			{/if}
			<ul>
				{#each shown as o (o.value)}
					<li>
						<label>
							<input
								type="checkbox"
								checked={selected.includes(o.value)}
								onchange={() => toggle(o.value)}
							/>
							<span class="txt">{o.label}</span>
							{#if o.hint}<span class="hint">{o.hint}</span>{/if}
						</label>
					</li>
				{:else}
					<li class="none">No match for “{filter}”</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.ms {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
		background: var(--bg);
		padding: 0.35rem 0.45rem;
	}
	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.label.placeholder {
		color: var(--muted);
	}
	.badge {
		font-size: 0.72rem;
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}
	.caret {
		color: var(--muted);
		font-size: 0.7rem;
	}
	.panel {
		position: absolute;
		z-index: 20;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 2px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 6px;
		box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
		padding: 0.4rem;
		max-height: 16rem;
		display: flex;
		flex-direction: column;
	}
	.filter {
		width: 100%;
		margin-bottom: 0.3rem;
	}
	.clear {
		font-size: 0.75rem;
		padding: 0.15rem 0.4rem;
		margin-bottom: 0.3rem;
		align-self: flex-start;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
	}
	li label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.22rem 0.3rem;
		cursor: pointer;
		border-radius: 4px;
	}
	li label:hover {
		background: var(--accent-soft);
	}
	.txt {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.none {
		padding: 0.3rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
