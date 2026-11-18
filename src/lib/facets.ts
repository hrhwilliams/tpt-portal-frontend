import { isPicked, toParams, type PickableFacet } from "$lib/query";
import type { CountedValue, SearchQuery, Summary } from "$lib/types";

/** Per facet, the summary from before its first pick. */
export type Bases = Partial<Record<PickableFacet, Summary | null>>;

/** A listed facet value; `picked` when the query filters on it, `gone` when only the base still has it. */
export type FacetRow = CountedValue & { type?: string; picked?: boolean; gone?: boolean };

/** The query's filters, without what only changes the view: the open table, its page and its columns. */
export const filterKey = (q: SearchQuery) => toParams({ ...q, tab: "", page: 1, cols: [] }).toString();

// the attribute and part facets hold values of several types
export const rowKey = (r: FacetRow) => (r.type ? `${r.type}|${r.value}` : r.value);

/**
 * One facet's values as listed. A pickable facet keeps its base's values, with
 * the current count where still matched and the base's own, grayed, where not.
 * Picked values come first, then matched, then gone; by count within each.
 */
export function facetRows(
  rows: FacetRow[],
  pick?: { query: SearchQuery; facet: PickableFacet; base?: FacetRow[] },
): FacetRow[] {
  let listed = rows;

  if (pick?.base) {
    const counts = new Map(rows.map((r) => [rowKey(r), r.count]));
    const known = new Set(pick.base.map(rowKey));
    listed = [
      ...pick.base.map((r) => {
        const count = counts.get(rowKey(r));
        return count === undefined ? { ...r, gone: true } : { ...r, count };
      }),
      ...rows.filter((r) => !known.has(rowKey(r))),
    ];
  }

  if (pick) listed = listed.map((r) => (isPicked(pick.query, pick.facet, r) ? { ...r, picked: true } : r));

  const rank = (r: FacetRow) => (r.picked ? 0 : r.gone ? 2 : 1);
  return [...listed].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}
