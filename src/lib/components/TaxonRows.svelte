<script lang="ts">
  import MultiSelect from "./MultiSelect.svelte";
  import TaxonCombobox from "./TaxonCombobox.svelte";
  import type { Schema, TaxonPair } from "$lib/types";

  let { rows = $bindable(), schema }: { rows: TaxonPair[]; schema: Schema } = $props();

  const relationOptions = $derived(schema.relations.map((r) => ({ value: r.value, label: r.value })));

  function addRow() {
    const last = rows[rows.length - 1];
    rows = [...rows, { rank: last?.rank ?? "", name: "", relations: [] }];
  }

  function removeRow(i: number) {
    rows = rows.filter((_, n) => n !== i);
  }
</script>

<div class="rows">
  {#each rows as row, i (row)}
    {#if i > 0}<div class="op">OR</div>{/if}
    <div class="row">
      <div class="pair">
        <div class="field rank">
          <label class="lbl" for="taxon-rank-{i}">Rank</label>
          <select id="taxon-rank-{i}" bind:value={row.rank}>
            <option value="">— choose —</option>
            {#each schema.ranks as r (r.id)}
              <option value={r.id}>{r.label}</option>
            {/each}
          </select>
        </div>
        <div class="field name">
          <label class="lbl" for="taxon-name-{i}">Name</label>
          <TaxonCombobox id="taxon-name-{i}" bind:value={row.name} rank={row.rank} />
        </div>
      </div>
      <div class="field grow">
        <span class="lbl">Related to another record as</span>
        <MultiSelect
          id="taxon-relations-{i}"
          bind:selected={row.relations}
          options={relationOptions}
          placeholder="Any relationship"
          filterPlaceholder="Type to filter {schema.relations.length} relationships…"
        />
      </div>
      <button type="button" class="rm" onclick={() => removeRow(i)} aria-label="Remove this taxon"> × </button>
    </div>
  {/each}

  <button type="button" class="add" onclick={addRow}>+ Add taxon</button>

  {#if rows.length > 1}
    <p class="note">Returned specimens may match any of these taxa.</p>
  {/if}
</div>

<style>
  .note {
    margin: 0;
  }
  .pair {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
    flex: 1;
    min-width: 0;
  }
  .rank {
    flex: 1;
    min-width: 0;
  }
  .name {
    flex: 2;
    min-width: 0;
  }
  .rank select {
    width: 100%;
  }
</style>
