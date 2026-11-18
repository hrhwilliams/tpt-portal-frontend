<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { abbreviate } from "$lib/description";
  import { facetRows, rowKey, type Bases, type FacetRow } from "$lib/facets";
  import type { FacetValue } from "$lib/query";
  import type { FacetName, SearchQuery, Summary, SummaryBlock } from "$lib/types";

  /** One whole table's export links, named after the tab it previews. */
  export type ExportLinks = { label: string; csv: string; map: string };

  let {
    summary,
    bases,
    error,
    exports,
    query,
    taxaPickable,
    toggle,
  }: {
    summary: Summary | null;
    /** Per facet, the summary from before its first pick; its values stay listed, grayed when no longer matched. */
    bases: Bases;
    error: string;
    exports: ExportLinks[];
    query: SearchQuery;
    /** whether a taxon value narrows the taxon row; only a search on one taxon row can be */
    taxaPickable: boolean;
    toggle: (facet: FacetName, v: FacetValue) => void;
  } = $props();

  const related = $derived(summary?.related ?? []);
  // synonym lists opened, by their first hidden name
  const expanded = new SvelteSet<string>();

  const label = (r: FacetRow) => (r.type ? `${r.type}: ${r.value}` : r.value);

  const COLUMNS: [FacetName, string][] = [
    ["taxa", "Taxa"],
    ["countries", "Countries"],
    ["states", "States / provinces"],
    ["collections", "Collections"],
    ["collectors", "Collectors"],
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
{#snippet facet(title: string, rows: FacetRow[], filter?: FacetName)}
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
  {@const links = exports.find((x) => x.label === title)}
  <section>
    <h3>
      {title} <span class="tally">{n(b.matched)}</span>
      {#if links}
        <a class="link" href={links.csv} rel="external">Export as CSV</a>
        <a class="link" href={links.map} target="_blank" rel="external noreferrer">Map in BerkeleyMapper ↗</a>
      {/if}
    </h3>
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
        {#if pickable && (name !== "taxa" || taxaPickable)}
          {@const base = bases[name]?.records.facets[name]}
          {@render facet(title, facetRows(rows, { query, facet: name, base }), name)}
        {:else}
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
    <p class="echo">
      <!-- &nbsp;: Svelte trims plain spaces at a block's edges -->
      {#each abbreviate(summary.description, summary.synonyms) as p, i (i)}{#if "text" in p}{p.text}{:else if expanded.has(p.hidden[0])}{`, ${p.hidden.join(", ")}`}&nbsp;<button
            type="button"
            class="more"
            onclick={() => expanded.delete(p.hidden[0])}>collapse</button
          >{:else}&nbsp;and <button type="button" class="more" onclick={() => expanded.add(p.hidden[0])}
            >{p.hidden.length} {p.hidden.length === 1 ? "other" : "others"}…</button
          >{/if}{/each}
    </p>
  {/if}
  {#if summary.synonyms}
    {@const syn = summary.synonyms}
    <div class="synonyms">
      {#each syn.taxa as t (t.name)}
        {#if (t.status === "synonym" || t.status === "accepted") && t.accepted}
          {@const a = t.accepted}
          {@const src = syn.sources.find((s) => s.key === a.source)}
          {@const authorship = a.authorship ? ` ${a.authorship}` : ""}
          <div>
            {#if t.status === "synonym"}<i>{t.name}</i> is a synonym of <i>{a.name}</i>{authorship}{:else}<i>{a.name}</i
              >{authorship} is the accepted name{/if}{#if src}{t.status === "synonym"
                ? " according to "
                : " in "}{#if a.link}<a href={a.link} target="_blank" rel="external noreferrer" title={src.title}
                  >{src.alias} (click for references)</a
                >{:else}<span title={src.title}>{src.alias}</span>{/if}{/if}{src
              ? " and "
              : t.status === "synonym"
                ? " according to "
                : " in "}<a href="https://www.catalogueoflife.org/" target="_blank" rel="external noreferrer"
              >{syn.release.title} ({syn.release.version})</a
            >.
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if summary.description || summary.synonyms}
    <hr />
  {/if}
  {@render block("Records", summary.records, true)}
  {#each related as r (r.relation)}
    {@render block(`${r.relation} records`, r)}
  {/each}
{/if}

<style>
  /* separates neighbouring summaries */
  section + section {
    border-top: 1px solid var(--line);
    margin-top: 1rem;
  }
  hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 0.8rem 0 0;
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
  .more {
    all: unset;
    cursor: pointer;
    color: var(--accent);
  }
  .more:hover {
    text-decoration: underline;
  }
  .more:focus-visible {
    outline: 2px solid var(--accent);
  }
  .synonyms {
    font-size: 0.85rem;
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
  /* at most five across: no column narrower than a fifth of the row */
  .facets {
    --gap: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(max(13rem, calc((100% - 4 * var(--gap)) / 5)), 1fr));
    gap: var(--gap);
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
  /* a table's actions, beside its count */
  .link {
    margin-left: 0.8rem;
    font-size: 0.85rem;
    font-weight: 400;
  }
</style>
