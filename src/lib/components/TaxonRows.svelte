<script lang="ts">
	import TaxonCombobox from './TaxonCombobox.svelte';
	import MultiSelect from './MultiSelect.svelte';
	import type { Schema, TaxonPair } from '$lib/types';

	let {
		rows = $bindable(),
		guidPrefixes = $bindable(),
		schema
	}: { rows: TaxonPair[]; guidPrefixes: string[]; schema: Schema } = $props();

	const collectionOptions = $derived(
		schema.guid_prefixes.map((p) => ({
			value: p.value,
			label: p.value,
			hint: p.count.toLocaleString()
		}))
	);

	function add() {
		// a new row inherits the previous row's rank — "another species" is the
		// common case, and retyping the rank every time is friction
		const last = rows[rows.length - 1];
		rows = [...rows, { rank: last?.rank ?? '', name: '' }];
	}

	function remove(i: number) {
		rows = rows.filter((_, n) => n !== i);
	}
</script>

<div class="rows">
	{#each rows as row, i (i)}
		{#if i > 0}<div class="op">OR</div>{/if}
		<div class="row">
			<label>
				<span class="lbl">Rank</span>
				<select bind:value={row.rank}>
					<option value="">— choose —</option>
					{#each schema.ranks as r (r.id)}
						<option value={r.id}>{r.label}</option>
					{/each}
				</select>
			</label>
			<label class="grow">
				<span class="lbl">Name</span>
				<TaxonCombobox bind:value={row.name} rank={row.rank} />
			</label>
			<button type="button" class="rm" onclick={() => remove(i)} aria-label="Remove this taxon">
				×
			</button>
		</div>
	{/each}

	<button type="button" class="add" onclick={add}>+ Add taxon</button>

	{#if rows.length}<div class="op and">AND</div>{/if}
	<div class="collection">
		<span class="lbl">Held by collection</span>
		<MultiSelect
			id="collections"
			bind:selected={guidPrefixes}
			options={collectionOptions}
			placeholder="Any collection"
			filterPlaceholder="Type to filter {schema.guid_prefixes.length} collections…"
		/>
	</div>
	<p class="note">
		Which collection holds the record, not what the organism is. Several collections
		<strong>OR</strong> together; the set as a whole <strong>narrows</strong> the rows above rather than
		adding to them.
	</p>

	{#if rows.length > 1}
		<p class="note">
			Rows combine with <strong>OR</strong> — a specimen matching any one of them is returned. Rows may
			use different ranks.
		</p>
	{/if}
</div>

<style>
	/* shared row/label/op styles are global — see +layout.svelte */
	.op.and {
		color: var(--fg);
	}
	.collection {
		max-width: 22rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.note {
		margin: 0;
	}
</style>
