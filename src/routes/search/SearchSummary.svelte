<script lang="ts">
  import { page } from "$app/state";
  import { facetRows, rowKey, type Bases, type FacetRow } from "$lib/facets";
  import type { FacetValue, PickableFacet } from "$lib/query";
  import type { FacetName, SearchQuery, Summary, SummaryBlock } from "$lib/types";

  /** One whole table's export links, named after the tab it previews. */
  export type ExportLinks = { label: string; csv: string; map: string };

  let {
    summary,
    bases,
    error,
    exports,
    query,
    toggle,
  }: {
    summary: Summary | null;
    /** Per facet, the summary from before its first pick; its values stay listed, grayed when no longer matched. */
    bases: Bases;
    error: string;
    exports: ExportLinks[];
    query: SearchQuery;
    toggle: (facet: PickableFacet, v: FacetValue) => void;
  } = $props();

  const related = $derived(summary?.related ?? []);

  let copied = $state(false);
  async function copyUrl() {
    await navigator.clipboard.writeText(page.url.href);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const label = (r: FacetRow) => (r.type ? `${r.type}: ${r.value}` : r.value);

  // the attribute and part facets show only once the service sends them
  const COLUMNS: [FacetName, string][] = [
    ["taxa", "Taxa"],
    ["countries", "Countries"],
    ["states", "States / provinces"],
    ["collections", "Collections"],
    ["detections", "Examined for / detected"],
    ["attributes", "Other attributes"],
    ["parts", "Parts"],
  ];

  const n = (v: number) => v.toLocaleString();
  const years = (b: SummaryBlock) =>
    b.years === null ? "—" : b.years.min === b.years.max ? String(b.years.min) : `${b.years.min}–${b.years.max}`;
</script>

<!-- `filter` makes each value toggle in the query; only the matched records'
     facets get one, since the filters narrow those and not the related records -->
{#snippet facet(title: string, rows: FacetRow[], filter?: PickableFacet)}
  <div class="facet">
    <h4>{title}</h4>
    {#if rows.length}
      <!-- scaled to the values still matched; the grayed ones get no bar -->
      {@const max = Math.max(1, ...rows.filter((r) => !r.gone).map((r) => r.count))}
      <div class="rows">
        <table>
          <tbody>
            {#each rows as r (rowKey(r))}
              <tr style="--pct: {r.gone ? 0 : (r.count / max) * 100}%" class:gone={r.gone}>
                <td>
                  {#if filter}
                    <button
                      type="button"
                      class="pick"
                      aria-pressed={!!r.picked}
                      title={r.picked ? "Remove from the filter" : "Add to the filter"}
                      onclick={() => toggle(filter, r)}
                    >
                      {label(r)}
                    </button>
                  {:else}
                    {label(r)}
                  {/if}
                </td>
                <td class="n">{n(r.count)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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
      {#each COLUMNS as [name, title] (name)}
        {@const rows = b.facets[name]}
        {#if rows && pickable && name !== "taxa"}
          {@const base = bases[name]?.records.facets[name]}
          {@render facet(title, facetRows(rows, { query, facet: name, base }), name)}
        {:else if rows}
          {@render facet(title, facetRows(rows))}
        {/if}
      {/each}
    </div>
  </section>
{/snippet}

{#if error}
  <p class="note warn">{error}</p>
{:else if summary}
  {#if summary.description}
    <p class="echo">{summary.description}</p>
  {/if}
  {#if summary.synonyms}
    {@const syn = summary.synonyms}
    <div class="synonyms">
      {#each syn.taxa as t (t.name)}
        {#if t.status === "synonym" && t.accepted}
          {@const a = t.accepted}
          {@const src = a.source === null ? undefined : syn.sources[a.source]}
          <div>
            <i>{t.name}</i> is a synonym of <i>{a.name}</i>{a.authorship ? ` ${a.authorship}` : ""}{#if src}, according
              to
              {#if a.link}<a href={a.link} target="_blank" rel="external noreferrer" title={src.title}>{src.alias}</a
                >{:else}<span title={src.title}>{src.alias}</span>{/if}{/if}.
            {#if a.references.length}
              <details>
                <summary>References</summary>
                <ul>
                  {#each a.references as r (r)}<li>{r}</li>{/each}
                </ul>
              </details>
            {/if}
          </div>
        {/if}
      {/each}
      <p class="note">Synonymy via {syn.release.title} ({syn.release.version})</p>
    </div>
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
  .synonyms {
    font-size: 0.85rem;
  }
  .synonyms details {
    display: inline;
    margin-left: 0.4rem;
  }
  .synonyms ul {
    margin: 0.2rem 0;
    padding-left: 1.2rem;
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
  /* ten single-line rows (a line plus the cells' padding); the rest scroll */
  .rows {
    font-size: 0.8rem;
    max-height: calc(10 * (1lh + 0.3rem));
    overflow-y: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
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
  /* listed from before the facet picks, but matched by none of the records now */
  tr.gone {
    opacity: 0.45;
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
