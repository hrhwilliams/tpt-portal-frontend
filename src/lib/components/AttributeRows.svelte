<script lang="ts">
  import MultiSelect from "./MultiSelect.svelte";
  import type { AttributePair, AttributeTypeDef, BoolOp, Schema } from "$lib/types";

  let {
    rows = $bindable(),
    op = $bindable(),
    advanced = false,
    schema,
    types = schema.attribute_types,
  }: {
    rows: AttributePair[];
    op: BoolOp;
    advanced?: boolean;
    schema: Schema;
    types?: AttributeTypeDef[];
  } = $props();

  const uid = $props.id();

  function typeDef(id: string) {
    return schema.attribute_types.find((t) => t.id === id) ?? null;
  }

  /** The value input is a dropdown when the type uses a code table. */
  function vocabFor(id: string) {
    const table = typeDef(id)?.vocabulary;
    return table ? (schema.vocabularies[table] ?? null) : null;
  }

  function addRow() {
    rows = [...rows, { type: "", values: [], negated: false }];
  }

  function removeRow(row: AttributePair) {
    rows = rows.filter((r) => r !== row);
  }
</script>

<div class="rows">
  {#if advanced && rows.length > 1}
    <fieldset class="opsel">
      <legend class="lbl">Combine rows with</legend>
      <label><input type="radio" bind:group={op} value="and" /> Record must have all attributes</label>
      <label><input type="radio" bind:group={op} value="or" /> Record must have at least one of the attributes</label>
    </fieldset>
  {/if}

  {#each rows as row, i (row)}
    {@const def = typeDef(row.type)}
    {@const vocab = vocabFor(row.type)}
    {#if i > 0}<div class="op">{op.toUpperCase()}</div>{/if}
    <div class="row" class:negated={row.negated}>
      <div class="controls">
        {#if advanced}
          <label class="neg" title="Require that the record does NOT have this attribute">
            <input type="checkbox" bind:checked={row.negated} />
            <span>NOT</span>
          </label>
        {/if}

        <div class="field grow">
          <label class="lbl" for="attr-type-{uid}-{i}">Attribute</label>
          <select id="attr-type-{uid}-{i}" bind:value={row.type} onchange={() => (row.values = [])}>
            <option value="">— choose —</option>
            {#each types as t (t.id)}
              <option value={t.id} title={t.description}>{t.label}</option>
            {/each}
          </select>
        </div>

        <div class="field grow">
          <label class="lbl" for="attr-value-{uid}-{i}">
            Value <em class="hint">(optional)</em>
            {#if vocab}<em class="hint">· pick any number</em>
            {:else if row.type}<em class="hint">· free text</em>{/if}
          </label>
          {#if vocab}
            <MultiSelect
              id="attr-value-{uid}-{i}"
              bind:selected={row.values}
              options={vocab.map((v) => ({ value: v.value, label: v.value }))}
              placeholder="Any value"
              filterPlaceholder="Type to filter {vocab.length} values…"
            />
          {:else}
            <input
              id="attr-value-{uid}-{i}"
              type="text"
              autocomplete="off"
              value={row.values[0] ?? ""}
              oninput={(e) => (row.values = [e.currentTarget.value])}
              disabled={!row.type}
              placeholder={row.type ? "any value" : "choose an attribute first"}
            />
          {/if}
        </div>

        <button type="button" class="rm" onclick={() => removeRow(row)} aria-label="Remove this row"> × </button>
      </div>

      {#if def?.description}
        <p class="desc">{def.description}</p>
      {/if}
    </div>
  {/each}

  <button type="button" class="add" onclick={addRow}>+ Add attribute</button>

  {#if rows.length > 1}
    <p class="note">
      {#if op === "and"}
        Returned specimens must match all rows
      {:else}
        Returned specimen may match any one attribute.
      {/if}
    </p>
  {/if}
</div>

<style>
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
