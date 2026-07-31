<script lang="ts">
	import type { Taxon } from '$lib/types';
	import taxa from '$lib/fixtures/taxa.json';

	let { value = $bindable(), rank }: { value: string; rank: string } = $props();

	let open = $state(false);
	let active = $state(-1);

	const all = taxa as Taxon[];

	// Stands in for GET /api/taxa. Same contract: prefix match on the whole
	// name, >= 2 characters, ordered by record count, capped.
	const matches = $derived.by(() => {
		const q = value.trim().toLowerCase();
		if (q.length < 2) return [];
		return all
			.filter((t) => (!rank || t.rank === rank) && t.name.toLowerCase().startsWith(q))
			.filter((t) => t.name.toLowerCase() !== q)
			.slice(0, 10);
	});

	function choose(t: Taxon) {
		value = t.name;
		open = false;
		active = -1;
	}

	function onkeydown(e: KeyboardEvent) {
		if (!matches.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			active = (active + 1) % matches.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + matches.length) % matches.length;
		} else if (e.key === 'Enter' && open && active >= 0) {
			e.preventDefault();
			choose(matches[active]);
		} else if (e.key === 'Escape') {
			open = false;
			active = -1;
		}
	}
</script>

<div class="combo">
	<input
		type="text"
		bind:value
		{onkeydown}
		oninput={() => {
			open = true;
			active = -1;
		}}
		onblur={() => setTimeout(() => (open = false), 120)}
		placeholder="e.g. Sorex"
		role="combobox"
		aria-expanded={open && matches.length > 0}
		aria-controls="taxon-list"
		aria-autocomplete="list"
	/>

	{#if open && matches.length}
		<ul id="taxon-list" role="listbox">
			{#each matches as t, i (t.rank + t.name)}
				<li role="option" aria-selected={i === active}>
					<button
						type="button"
						class:active={i === active}
						onmousedown={() => choose(t)}
						onmouseenter={() => (active = i)}
					>
						<span class="name">{t.name}</span>
						<span class="meta">
							{t.rank}{#if t.parent_name}, in {t.parent_name}{/if} · {t.record_count.toLocaleString()}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if open && value.trim().length >= 2}
		<ul id="taxon-list" role="listbox">
			<li class="none">No taxon matching that in this snapshot. You can still search for it.</li>
		</ul>
	{/if}
</div>

<style>
	.combo {
		position: relative;
	}
	ul {
		position: absolute;
		z-index: 20;
		top: 100%;
		left: 0;
		right: 0;
		margin: 2px 0 0;
		padding: 0;
		list-style: none;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 6px;
		box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
		max-height: 15rem;
		overflow-y: auto;
	}
	li button {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		padding: 0.35rem 0.55rem;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}
	li button.active {
		background: var(--accent-soft);
	}
	.name {
		font-weight: 600;
	}
	.meta {
		font-size: 0.78rem;
		color: var(--muted);
		white-space: nowrap;
	}
	.none {
		padding: 0.45rem 0.55rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
</style>
