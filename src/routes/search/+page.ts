import { error } from "@sveltejs/kit";
import { getSchema, getSummary, search, searchRelations } from "$lib/api";
import { fromParams, isEmpty } from "$lib/query";
import type { Summary } from "$lib/types";
import type { PageLoad } from "./$types";

/** One tab of records related to the matched ones by a single relationship. */
export type RelatedTable = {
  relation: string;
  records: Record<string, unknown>[] | null;
  columns: string[];
  matched: number;
  error: string;
};

export const load: PageLoad = async ({ url, fetch }) => {
  const schemaPromise = getSchema(fetch);

  const query = fromParams(url.searchParams);
  const submitted = url.searchParams.toString().length > 0;
  const errors: string[] = [];

  let records: Record<string, unknown>[] | null = null;
  let columns: string[] = [];
  let matched = 0;
  let related: RelatedTable[] = [];
  let summary: Summary | null = null;
  let summaryError = "";
  // one tab per relationship the search names
  const relations = [...new Set(query.taxa.flatMap((t) => t.relations))];

  if (submitted && !isEmpty(query) && errors.length === 0) {
    // `page` belongs to whichever tab is open; the others start over
    const relatedOpen = relations.includes(query.tab);

    // `tab` is ours, except that `/api/relations` reads it as the one relationship to follow
    const params = new URLSearchParams(url.searchParams);
    params.delete("tab");

    // the summary covers the whole result set, so it has no page
    const summaryParams = new URLSearchParams(params);
    summaryParams.delete("page");
    // failures are caught as each request starts, or one that fails while
    // `search` is still pending surfaces as an unhandled rejection
    const summaryPromise = getSummary(fetch, summaryParams).then(
      (s) => {
        summary = s;
      },
      (e) => {
        // the previews still work without it
        summaryError = e instanceof Error ? e.message : "The summary failed to load.";
      },
    );

    // ponytail: fetches a full first page of every tab just for its count;
    // the service has no count-only request
    // a failure here must not take the main results down with it
    const relatedPromise = Promise.all(
      relations.map((relation) => {
        const relatedParams = new URLSearchParams(params);
        relatedParams.set("tab", relation);
        if (relation !== query.tab) relatedParams.delete("page");
        return searchRelations(fetch, relatedParams).then(
          (r): RelatedTable => ({ relation, ...r, error: "" }),
          (e): RelatedTable => ({
            relation,
            records: null,
            columns: [],
            matched: 0,
            error: e instanceof Error ? e.message : "Related records failed to load.",
          }),
        );
      }),
    );

    if (relatedOpen) {
      params.delete("page");
    }

    try {
      ({ records, columns, matched } = await search(fetch, params));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Search failed.");
    }

    related = await relatedPromise;
    await summaryPromise;
  }

  let schema;
  try {
    schema = await schemaPromise;
  } catch (e) {
    error(503, e instanceof Error ? e.message : `Could not load the search form from ${__API_BASE__}.`);
  }

  return {
    schema,
    query,
    submitted,
    errors,
    records,
    columns,
    matched,
    related,
    summary,
    summaryError,
  };
};
