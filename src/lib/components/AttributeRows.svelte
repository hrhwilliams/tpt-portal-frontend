<script lang="ts">
	import type { AttributePair, BoolOp, Schema } from '$lib/types';

	let {
		rows = $bindable(),
		op = $bindable(),
		schema
	}: { rows: AttributePair[]; op: BoolOp; schema: Schema } = $props();

	function typeDef(id: string) {
		return schema.attribute_types.find((t) => t.id === id) ?? null;
	}

	/** The value input is a dropdown when the type declares a code table. */
	function vocabFor(id: string) {
		const table = typeDef(id)?.vocabulary;
		return table ? (schema.vocabularies[table] ?? null) : null;
	}

	function add() {
		rows = [...rows, { type: '', value: '', negated: false }];
	}

	function remove(i: number) {
		rows = rows.filter((_, n) => n !== i);
	}

	function indent(value: string) {
		return value.includes(':') ? '    ' : '';
	}
</script>

<div class="rows">
	{#if rows.length > 1}
		<fieldset class="opsel">
			<legend class="lbl">Combine rows with</legend>
			<label><input type="radio" bind:group={op} value="and" /> AND — all must hold</label>
			<label><input type="radio" bind:group={op} value="or" /> OR — any may hold</label>
		</fieldset>
	{/if}

	{#each rows as row, i (i)}
		{@const def = typeDef(row.type)}
		{@const vocab = vocabFor(row.type)}
		{#if i > 0}<div class="op">{op.toUpperCase()}</div>{/if}
		<div class="row" class:negated={row.negated}>
			<label class="neg" title="Require that the specimen does NOT carry this">
				<input type="checkbox" bind:checked={row.negated} />
				<span>NOT</span>
			</label>

			<label class="grow">
				<span class="lbl">Attribute</span>
				<select bind:value={row.type} onchange={() => (rows[i].value = '')}>
					<option value="">— choose —</option>
					{#each schema.attribute_types as t (t.id)}
						<option value={t.id} title={t.description}>{t.label}</option>
					{/each}
				</select>
			</label>

			<label class="grow">
				<span class="lbl">
					Value
					{#if vocab}<em class="hint">{vocab.length} controlled values</em>
					{:else if row.type}<em class="hint">free text</em>{/if}
				</span>
				{#if vocab}
					<select bind:value={row.value}>
						<option value="">— choose —</option>
						{#each vocab as v (v.value)}
							<option value={v.value} title={v.description}>{indent(v.value)}{v.value}</option>
						{/each}
					</select>
				{:else}
					<input
						type="text"
						bind:value={row.value}
						disabled={!row.type}
						placeholder={row.type ? 'value' : 'choose an attribute first'}
					/>
				{/if}
			</label>

			<button type="button" class="rm" onclick={() => remove(i)} aria-label="Remove this row">
				×
			</button>
		</div>

		{#if def?.description}
			<p class="desc">{def.description}</p>
		{/if}
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
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
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
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: flex-end;
		padding: 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--panel);
	}
	.row.negated {
		border-color: #b4544a;
		background: color-mix(in srgb, #b4544a 8%, var(--panel));
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.lbl {
		font-size: 0.75rem;
		color: var(--muted);
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
	.op {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--muted);
		letter-spacing: 0.06em;
		padding-left: 0.5rem;
	}
	.desc {
		margin: -0.1rem 0 0.3rem 0.5rem;
		font-size: 0.78rem;
		color: var(--muted);
		max-width: 70ch;
	}
	.rm {
		padding: 0.3rem 0.6rem;
		line-height: 1;
		font-size: 1.1rem;
	}
	.add {
		align-self: flex-start;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
