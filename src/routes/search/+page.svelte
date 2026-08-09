<script lang="ts">
  import { navigating, page } from "$app/state";
  import { resolve } from "$app/paths";
  import { downloadUrl } from "$lib/api";
  import AttributeRows from "$lib/components/AttributeRows.svelte";
  import CollectorCombobox from "$lib/components/CollectorCombobox.svelte";
  import MultiSelect from "$lib/components/MultiSelect.svelte";
  import TaxonRows from "$lib/components/TaxonRows.svelte";
  import { DETECTION_ATTRIBUTE_TYPE_IDS, hasNegatedRow, toParams } from "$lib/query";
  import { SearchQueryState } from "./query-state.svelte.ts";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const queryState = new SearchQueryState(() => data.query);
  const q = $derived(queryState.query);
  const advanced = $derived(queryState.advanced);
  const detectionTypes = $derived(data.schema.attribute_types.filter((t) => DETECTION_ATTRIBUTE_TYPE_IDS.has(t.id)));
  const otherTypes = $derived(data.schema.attribute_types.filter((t) => !DETECTION_ATTRIBUTE_TYPE_IDS.has(t.id)));
  const negated = $derived(hasNegatedRow(q));
  const opts = (vals: { value: string; count: number }[]) =>
    vals.map((v) => ({ value: v.value, label: v.value, hint: v.count.toLocaleString() }));
  const collectionOptions = $derived(opts(data.schema.guid_prefixes));
  const countryOptions = $derived(opts(data.schema.countries));
  const stateOptions = $derived(opts(data.schema.states));
  const searchUrl = $derived(resolve(`/search?${toParams(q).toString()}`));
  const searching = $derived(navigating.to !== null);
  const columns = $derived(data.records?.length ? Object.keys(data.records[0]) : []);
  const cell = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const csvUrl = $derived(downloadUrl(page.url.searchParams));
  let csvExported = $state(false);
  $effect(() => {
    csvUrl;
    csvExported = false;
  });
  const limits = $derived(data.schema.limits);
  const pageCount = $derived(Math.ceil(data.matched / limits.page_size));
  const lastPage = $derived(Math.min(pageCount, Math.floor(limits.max_result_window / limits.page_size)));
</script>

<svelte:head><title>Search specimens — TPT portal</title></svelte:head>

<h1>Search specimens</h1>
<p class="snapshot">
  Data current as of {data.schema.snapshot_date}.
</p>

<form onsubmit={(e) => e.preventDefault()}>
  <fieldset>
    <legend>Global filters</legend>
    <div class="grid two">
      <div class="field">
        <span class="lbl">Held by collection</span>
        <MultiSelect
          id="collections"
          bind:selected={q.guid_prefixes}
          options={collectionOptions}
          placeholder="Any collection"
          filterPlaceholder="Type to filter {data.schema.guid_prefixes.length} collections…"
        />
      </div>
      <label>
        <span class="lbl">Locality</span>
        <input type="text" bind:value={q.locality} autocomplete="off" placeholder="Any locality string" />
      </label>
      <div class="field">
        <span class="lbl">Country</span>
        <MultiSelect
          id="countries"
          bind:selected={q.countries}
          options={countryOptions}
          placeholder="Any country"
          filterPlaceholder="Type to filter {data.schema.countries.length} countries…"
        />
      </div>
      <div class="field">
        <span class="lbl">State / province</span>
        <MultiSelect
          id="states"
          bind:selected={q.states}
          options={stateOptions}
          placeholder="Any state or province"
          filterPlaceholder="Type to filter {data.schema.states.length} states…"
        />
      </div>
      <div class="field">
        <label class="lbl" for="collector">Collector</label>
        <CollectorCombobox id="collector" bind:value={q.agent} options={data.schema.collectors} />
      </div>
      <label>
        <span class="lbl">Collected from</span>
        <input type="date" bind:value={q.collected_from} />
      </label>
      <label>
        <span class="lbl">Collected to</span>
        <input type="date" bind:value={q.collected_to} />
      </label>
    </div>
    <!-- <p class="note">
			Values within one dropdown <strong>OR</strong> together; separate filters
			<strong>AND</strong>. Locality matches whole place names, and applies together with the date
			to the
			<strong>same collecting event</strong>. Country, state and collector are record-level, so they
			are not tied to that event — a specimen collected in two countries can match a country-A
			search with a date from its country-B visit. Some collection dates record only a year or a
			month; a year-only date is read as 1 January, so a mid-year range will not match it.
		</p> -->
  </fieldset>

  <fieldset>
    <legend>Search by taxonomy</legend>
    <TaxonRows bind:rows={q.taxa} schema={data.schema} />
    <!-- <p class="note">
			Suggestions come from the current snapshot. A name that is not listed can still be searched
			for.
		</p> -->
    <!-- <p class="note">
      A relationship is the record's own side of the link: <em>parasite of</em> finds the parasites,
      <em>host of parasite</em> finds their hosts. Several on one row
      <strong>OR</strong> together.
    </p> -->
  </fieldset>

  <fieldset>
    <legend>Examined for/detected attributes</legend>
    <AttributeRows
      bind:rows={q.detectionAttributes}
      bind:op={q.attr_op}
      {advanced}
      schema={data.schema}
      types={detectionTypes}
    />

    <label class="adv">
      <input type="checkbox" checked={advanced} onchange={(e) => queryState.toggleAdvanced(e.currentTarget.checked)} />
      <span>Advanced</span>
      <em>negate a row, switch <strong>AND</strong>/<strong>OR</strong>, filter by method</em>
    </label>

    {#if advanced}
      <label class="method">
        <span class="lbl">Method contains</span>
        <input type="text" bind:value={q.method} disabled={negated} autocomplete="off" placeholder="e.g. immunoblot" />
      </label>
      {#if negated}
        <p class="note warn">
          Method is unavailable while a row is negated. &ldquo;No <em>detected</em> row
          <em>by this method</em>&rdquo; would still match a specimen whose positive was found another way.
        </p>
      {:else}
        <p class="note">Method is recorded as prose, so matching is approximate.</p>
      {/if}
    {/if}

    <!-- <p class="note">
			Results reflect what was recorded. A specimen with no result row is <strong>not</strong>
			necessarily a negative — it may have been examined with the outcome unrecorded, or never examined.
			<em>Not detected</em> returns only explicitly recorded negatives.
			<a
				href="https://handbook.arctosdb.org/best_practices/examined.html"
				target="_blank"
				rel="noreferrer"
			>
				Arctos guidance on examined/detected data
			</a>
		</p> -->
  </fieldset>

  <fieldset>
    <legend>Other record attributes</legend>
    <AttributeRows
      bind:rows={q.otherAttributes}
      bind:op={q.attr_op}
      {advanced}
      schema={data.schema}
      types={otherTypes}
    />
  </fieldset>

  <div class="actions">
    <button type="submit" class="primary">Search</button>
    <button type="button" onclick={() => queryState.reset()}>Clear</button>
    <code class="url">{searchUrl}</code>
  </div>
</form>

{#if data.errors.length}
  <div class="panel errors">
    <h2>This search cannot run</h2>
    <ul>
      {#each data.errors as e (e)}<li>{e}</li>{/each}
    </ul>
  </div>
{/if}

{#if data.records}
  <div class="panel" class:stale={searching}>
    <div class="head">
      <h2>
        {data.matched.toLocaleString()} result{data.matched === 1 ? "" : "s"}
        {#if data.records.length}
          <a
            class="csv"
            class:disabled={csvExported}
            aria-disabled={csvExported}
            href={csvExported ? undefined : csvUrl}
            onclick={(e) => {
              if (csvExported) {
                e.preventDefault();
                return;
              }
              csvExported = true;
            }}
          >
            Export as CSV
          </a>
        {/if}
      </h2>
      {#if lastPage > 1}
        <nav class="pager">
          <button type="button" disabled={data.query.page <= 1} onclick={() => queryState.goPage(data.query.page - 1)}
            >← Previous</button
          >
          <span>
            Page {data.query.page.toLocaleString()} of {lastPage.toLocaleString()}
          </span>
          <button type="button" disabled={data.query.page >= lastPage} onclick={() => queryState.goPage(data.query.page + 1)}
            >Next →</button
          >
        </nav>
      {/if}
    </div>
    {#if pageCount > lastPage}
      <p class="note">
        Only the first {limits.max_result_window.toLocaleString()} results can be browsed. Narrow the search, or export.
      </p>
    {/if}
    {#if data.records.length}
      <div class="scroll">
        <table>
          <thead>
            <tr
              >{#each columns as c (c)}<th>{c}</th>{/each}</tr
            >
          </thead>
          <tbody>
            {#each data.records as hit, i (i)}
              <tr
                >{#each columns as c (c)}<td
                    >{#if c === "guid" && hit[c]}<a
                        href="https://arctos.database.museum/guid/{cell(hit[c])}"
                        target="_blank"
                        rel="noreferrer">{cell(hit[c])}</a
                      >{:else}{cell(hit[c])}{/if}</td
                  >{/each}</tr
              >
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{:else if data.submitted && !data.errors.length}
  <div class="panel">
    <p>No filters set.</p>
  </div>
{/if}

<style>
  h1 {
    margin-bottom: 0.2rem;
  }
  .snapshot {
    margin-top: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.9rem 1rem 1rem;
    margin: 0 0 1rem;
  }
  legend {
    font-weight: 700;
    padding: 0 0.4rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .grid.two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.7rem;
  }
  .adv {
    flex-direction: row;
    align-items: baseline;
    gap: 0.4rem;
    margin-top: 0.8rem;
    font-size: 0.85rem;
    width: fit-content;
    cursor: pointer;
  }
  .adv em {
    font-style: normal;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .method {
    margin-top: 0.7rem;
    max-width: 24rem;
  }
  .note.warn {
    color: #b4544a;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1.4rem;
  }
  .url {
    font-size: 0.72rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .panel {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.8rem 1rem;
    background: var(--panel);
    margin-bottom: 1.2rem;
  }
  .panel h2 {
    font-size: 1rem;
    margin: 0 0 0.3rem;
  }
  .errors {
    border-color: #b4544a;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .csv {
    font-weight: 400;
    font-size: 0.85rem;
    margin-left: 0.5rem;
  }
  .csv.disabled {
    color: var(--muted);
    pointer-events: none;
  }
  .pager {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    font-size: 0.85rem;
  }
  .stale {
    opacity: 0.5;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  th,
  td {
    border: 1px solid var(--line);
    padding: 0.25rem 0.5rem;
    text-align: left;
    max-width: 40ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  th {
    background: var(--bg);
  }
</style>
