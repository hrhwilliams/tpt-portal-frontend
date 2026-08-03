<script lang="ts">
	import MultiSelect from './MultiSelect.svelte';
	import TaxonCombobox from './TaxonCombobox.svelte';
	import type { Schema, TaxonPair } from '$lib/types';

	let { rows = $bindable(), schema }: { rows: TaxonPair[]; schema: Schema } = $props();

	// A code table, so no counts: every relationship exists whether or not this
	// snapshot happens to use it.
	const relationOptions = $derived(
		schema.relations.map((r) => ({ value: r.value, label: r.value }))
	);

	function add() {
		// a new row inherits the previous row's rank — "another species" is the
		// common case, and retyping the rank every time is friction
		const last = rows[rows.length - 1];
		rows = [...rows, { rank: last?.rank ?? '', name: '', relations: [] }];
	}

	function remove(i: number) {
		rows = rows.filter((_, n) => n !== i);
	}
</script>

<div class="rows">
	{#each rows as row, i (i)}
		{#if i > 0}<div class="op">OR</div>{/if}
		<div class="row">
			<!-- `for`/`id` rather than wrapping: a <label> around a <select> folds the
			     option text into the accessible name. -->
			<div class="field">
				<label class="lbl" for="taxon-rank-{i}">Rank</label>
				<select id="taxon-rank-{i}" bind:value={row.rank}>
					<option value="">— choose —</option>
					{#each schema.ranks as r (r.id)}
						<option value={r.id}>{r.label}</option>
					{/each}
				</select>
			</div>
			<div class="field grow">
				<label class="lbl" for="taxon-name-{i}">Name</label>
				<TaxonCombobox id="taxon-name-{i}" bind:value={row.name} rank={row.rank} />
			</div>
			<div class="field">
				<span class="lbl">Related to another record as</span>
				<MultiSelect
					id="taxon-relations-{i}"
					bind:selected={row.relations}
					options={relationOptions}
					placeholder="Any relationship"
					filterPlaceholder="Type to filter {schema.relations.length} relationships…"
				/>
			</div>
			<button type="button" class="rm" onclick={() => remove(i)} aria-label="Remove this taxon">
				×
			</button>
		</div>
	{/each}

	<button type="button" class="add" onclick={add}>+ Add taxon</button>

	{#if rows.length > 1}
		<p class="note">
			Rows combine with <strong>OR</strong> — a specimen matching any one of them is returned. Rows may
			use different ranks.
		</p>
	{/if}
</div>

<style>
	/* shared row/label/op styles are global — see +layout.svelte */
	.note {
		margin: 0;
	}
</style>
