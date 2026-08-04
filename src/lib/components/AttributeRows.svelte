<script lang="ts">
	import MultiSelect from './MultiSelect.svelte';
	import type { AttributePair, BoolOp, Schema } from '$lib/types';

	let {
		rows = $bindable(),
		op = $bindable(),
		advanced = false,
		schema
	}: { rows: AttributePair[]; op: BoolOp; advanced?: boolean; schema: Schema } = $props();

	function typeDef(id: string) {
		return schema.attribute_types.find((t) => t.id === id) ?? null;
	}

	/** The value input is a dropdown when the type declares a code table. */
	function vocabFor(id: string) {
		const table = typeDef(id)?.vocabulary;
		return table ? (schema.vocabularies[table] ?? null) : null;
	}

	function add() {
		rows = [...rows, { type: '', values: [], negated: false }];
	}

	function remove(i: number) {
		rows = rows.filter((_, n) => n !== i);
	}
</script>

<div class="rows">
	{#if advanced && rows.length > 1}
		<fieldset class="opsel">
			<legend class="lbl">Combine rows with</legend>
			<label><input type="radio" bind:group={op} value="and" /> AND — all must hold</label>
			<label><input type="radio" bind:group={op} value="or" /> OR — any may hold</label>
		</fieldset>
	{/if}

	<!-- keyed by the row object, not `i`: an index key would hand a removed row's
	     component instances (and their open dropdowns) to the row that survives it -->
	{#each rows as row, i (row)}
		{@const def = typeDef(row.type)}
		{@const vocab = vocabFor(row.type)}
		{#if i > 0}<div class="op">{op.toUpperCase()}</div>{/if}
		<div class="row" class:negated={row.negated}>
			<div class="controls">
				{#if advanced}
					<label class="neg" title="Require that the specimen does NOT carry this">
						<input type="checkbox" bind:checked={row.negated} />
						<span>NOT</span>
					</label>
				{/if}

				<div class="field grow">
					<label class="lbl" for="attr-type-{i}">Attribute</label>
					<select id="attr-type-{i}" bind:value={row.type} onchange={() => (rows[i].values = [])}>
						<option value="">— choose —</option>
						{#each schema.attribute_types as t (t.id)}
							<option value={t.id} title={t.description}>{t.label}</option>
						{/each}
					</select>
				</div>

				<div class="field grow">
					<label class="lbl" for="attr-value-{i}">
						Value <em class="hint">optional</em>
						{#if vocab}<em class="hint">· pick any number</em>
						{:else if row.type}<em class="hint">· free text</em>{/if}
					</label>
					{#if vocab}
						<!-- controlled vocabulary: pick several, they OR. Free-text types stay a
						     single input — there is nothing to enumerate. -->
						<MultiSelect
							id="attr-value-{i}"
							bind:selected={row.values}
							options={vocab.map((v) => ({ value: v.value, label: v.value }))}
							placeholder="Any value"
							filterPlaceholder="Type to filter {vocab.length} values…"
						/>
					{:else}
						<input
							id="attr-value-{i}"
							type="text"
							autocomplete="off"
							value={row.values[0] ?? ''}
							oninput={(e) => (row.values = [e.currentTarget.value])}
							disabled={!row.type}
							placeholder={row.type ? 'any value' : 'choose an attribute first'}
						/>
					{/if}
				</div>

				<button type="button" class="rm" onclick={() => remove(i)} aria-label="Remove this row">
					×
				</button>
			</div>

			{#if def?.description}
				<p class="desc">{def.description}</p>
			{/if}
		</div>
	{/each}

	<button type="button" class="add" onclick={add}>+ Add attribute</button>

	{#if rows.length > 1}
		<p class="note">
			{#if op === 'and'}
				Each row describes a separate attribute record on the specimen, and all must hold.
			{:else}
				A specimen matching any one row is returned.
			{/if}
		</p>
	{/if}
</div>

<style>
	/* shared row/label/op styles are global — see +layout.svelte */
	.opsel {
		display: flex;
		gap: 1rem;
		align-items: center;
		border: 0;
		padding: 0 0 0.2rem;
		margin: 0;
	}
	.opsel legend {
		float: left;
		margin-right: 0.7rem;
		padding: 0;
	}
	.opsel label {
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.82rem;
	}
	/* Overrides the global `.row` for this component only: the description has to
	   sit inside the box, so the box stacks and `.controls` carries the flex row.
	   Scoped class beats `:global(.row)` on specificity. */
	.row {
		flex-direction: column;
		align-items: stretch;
		gap: 0.45rem;
	}
	.controls {
		display: flex;
		gap: 0.6rem;
		align-items: flex-end;
	}
	.row.negated {
		border-color: #b4544a;
		background: color-mix(in srgb, #b4544a 8%, var(--panel));
	}
	/* `form label` stacks by default; keep the value hint on the caption's line so
	   choosing a type doesn't grow the row. */
	.field label {
		flex-direction: row;
		align-items: baseline;
		gap: 0.35rem;
	}
	.hint {
		font-style: normal;
		opacity: 0.7;
	}
	.neg {
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		font-weight: 600;
		padding-bottom: 0.4rem;
		white-space: nowrap;
	}
	.desc {
		margin: 0;
		font-size: 0.78rem;
		color: var(--muted);
		max-width: 70ch;
	}
	.note {
		margin: 0;
	}
</style>
