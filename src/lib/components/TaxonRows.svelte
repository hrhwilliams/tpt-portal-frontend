<script lang="ts">
  import MultiSelect from "./MultiSelect.svelte";
  import TaxonCombobox from "./TaxonCombobox.svelte";
  import type { Schema, TaxonPair } from "$lib/types";

  let { rows = $bindable(), schema }: { rows: TaxonPair[]; schema: Schema } = $props();

  // A code table, so no counts: every relationship exists whether or not this
  // snapshot happens to use it.
  const relationOptions = $derived(schema.relations.map((r) => ({ value: r.value, label: r.value })));

  function add() {
    // a new row inherits the previous row's rank — "another species" is the
    // common case, and retyping the rank every time is friction
    const last = rows[rows.length - 1];
    rows = [...rows, { rank: last?.rank ?? "", name: "", relations: [] }];
  }

  function remove(i: number) {
    rows = rows.filter((_, n) => n !== i);
  }
</script>

<div class="rows">
  <!-- keyed by the row object, not `i`: an index key would hand a removed row's
	     component instances (and their open dropdowns) to the row that survives it -->
  {#each rows as row, i (row)}
    {#if i > 0}<div class="op">OR</div>{/if}
    <div class="row">
      <div class="pair">
        <!-- `for`/`id` rather than wrapping: a <label> around a <select> folds the
				     option text into the accessible name. -->
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
      <button type="button" class="rm" onclick={() => remove(i)} aria-label="Remove this taxon"> × </button>
    </div>
  {/each}

  <button type="button" class="add" onclick={add}>+ Add taxon</button>

  {#if rows.length > 1}
    <p class="note">
      Rows combine with <strong>OR</strong> — a specimen matching any one of them is returned. Rows may use different ranks.
    </p>
  {/if}
</div>

<style>
  /* shared row/label/op styles are global — see +layout.svelte */
  .note {
    margin: 0;
  }
  /* rank + name are the row's left half, split 1:2; relationships (.grow) are the
	   right half, less what the remove button takes */
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
  /* a select sizes itself to its longest option otherwise */
  .rank select {
    width: 100%;
  }
</style>
