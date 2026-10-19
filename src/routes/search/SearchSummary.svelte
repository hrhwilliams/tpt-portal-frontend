<script lang="ts">
  import { page } from "$app/state";
  import type { CountedValue, SearchQuery, Summary, SummaryBlock } from "$lib/types";

  /** One whole table's export links, named after the tab it previews. */
  export type ExportLinks = { label: string; csv: string; map: string };

  /** The query's filters that a facet value can be added to as is. */
  export type FacetFilter = "countries" | "states" | "guid_prefixes";

  let {
    summary,
    error,
    exports,
    query,
    toggle,
  }: {
    summary: Summary | null;
    error: string;
    exports: ExportLinks[];
    query: SearchQuery;
    toggle: (filter: FacetFilter, value: string) => void;
  } = $props();

  const related = $derived(summary?.related ?? []);

  let copied = $state(false);
  async function copyUrl() {
    await navigator.clipboard.writeText(page.url.href);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const n = (v: number) => v.toLocaleString();
  const years = (b: SummaryBlock) =>
    b.years === null ? "—" : b.years.min === b.years.max ? String(b.years.min) : `${b.years.min}–${b.years.max}`;
</script>

<!-- `filter` makes each value toggle in that filter; only the matched records'
     facets get one, since the filters narrow those and not the related records -->
{#snippet facet(title: string, rows: CountedValue[], filter?: FacetFilter)}
  <div class="facet">
    <h4>{title}</h4>
    {#if rows.length}
      {@const max = Math.max(...rows.map((r) => r.count))}
      <table>
        <tbody>
          {#each rows as r (r.value)}
            <tr style="--pct: {(r.count / max) * 100}%">
              <td>
                {#if filter}
                  {@const on = query[filter].includes(r.value)}
                  <button
                    type="button"
                    class="pick"
                    aria-pressed={on}
                    title={on ? "Remove from the filter" : "Add to the filter"}
                    onclick={() => toggle(filter, r.value)}
                  >
                    {r.value}
                  </button>
                {:else}
                  {r.value}
                {/if}
              </td>
              <td class="n">{n(r.count)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note">None recorded.</p>
    {/if}
  </div>
{/snippet}

{#snippet block(title: string, b: SummaryBlock, pickable = false)}
  <section>
    <h3>{title} <span class="tally">{n(b.matched)}</span></h3>
    <dl class="stats">
      <div>
        <dt>Distinct taxa</dt>
        <dd>{n(b.distinct.taxa)}</dd>
      </div>
      <div>
        <dt>Localities</dt>
        <dd>{n(b.distinct.localities)}</dd>
      </div>
      <div>
        <dt>Collectors</dt>
        <dd>{n(b.distinct.collectors)}</dd>
      </div>
      <div>
        <dt>Collected</dt>
        <dd>{years(b)}</dd>
      </div>
    </dl>
    <div class="facets">
      {@render facet("Taxa", b.facets.taxa)}
      {@render facet("Countries", b.facets.countries, pickable ? "countries" : undefined)}
      {@render facet("States / provinces", b.facets.states, pickable ? "states" : undefined)}
      {@render facet("Collections", b.facets.collections, pickable ? "guid_prefixes" : undefined)}
    </div>
  </section>
{/snippet}

{#if error}
  <p class="note warn">{error}</p>
{:else if summary}
  {#if summary.description}
    <p class="echo">{summary.description}</p>
  {/if}
  {@render block("Records", summary.records, true)}
  {#each related as r (r.relation)}
    {@render block(`${r.relation} records`, r)}
  {/each}
{/if}

<section class="exports">
  <h3>Export</h3>
  <ul>
    {#each exports as x (x.label)}
      <li>
        <span>{x.label}</span>
        <a href={x.csv} rel="external">CSV</a>
        <a href={x.map} target="_blank" rel="external noreferrer">Map in BerkeleyMapper ↗</a>
      </li>
    {/each}
    <li><button type="button" onclick={copyUrl}>{copied ? "Copied" : "Copy search URL"}</button></li>
  </ul>
</section>

<style>
  /* separates neighbouring summaries, and the last one from the exports */
  section + section {
    border-top: 1px solid var(--line);
    margin-top: 1rem;
  }
  h3 {
    font-size: 0.95rem;
    margin: 1rem 0 0.4rem;
  }
  h4 {
    font-size: 0.85rem;
    margin: 0 0 0.3rem;
  }
  .tally {
    color: var(--muted);
    font-weight: 400;
    font-size: 0.85em;
  }
  .echo {
    font-style: italic;
    margin: 0.4rem 0;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1.2rem;
    margin: 0 0 0.8rem;
  }
  dt {
    font-size: 0.75rem;
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  .facets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  /* the count as a bar behind the row, no chart library */
  tr {
    background: linear-gradient(to right, var(--accent-soft) var(--pct), transparent var(--pct));
  }
  td {
    padding: 0.15rem 0.4rem;
    overflow-wrap: anywhere;
  }
  .pick {
    all: unset;
    cursor: pointer;
  }
  .pick:hover {
    text-decoration: underline;
  }
  .pick:focus-visible {
    outline: 2px solid var(--accent);
  }
  .pick[aria-pressed="true"] {
    font-weight: 600;
  }
  .pick[aria-pressed="true"]::before {
    content: "✓ ";
  }
  td.n {
    text-align: right;
    white-space: nowrap;
    color: var(--muted);
  }
  .note.warn {
    color: #b4544a;
  }
  .exports ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .exports li {
    display: flex;
    gap: 0.8rem;
    align-items: baseline;
  }
</style>
