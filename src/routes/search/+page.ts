import { error } from "@sveltejs/kit";
import { getSchema, search, searchRelations } from "$lib/api";
import { fromParams, isEmpty } from "$lib/query";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url, fetch }) => {
  const schemaPromise = getSchema(fetch);

  const query = fromParams(url.searchParams);
  const submitted = url.searchParams.toString().length > 0;
  const errors: string[] = [];

  let records: Record<string, unknown>[] | null = null;
  let matched = 0;
  let relatedRecords: Record<string, unknown>[] | null = null;
  let relatedMatched = 0;
  let relatedError = "";
  // only a search naming a relationship has related records to show
  const relatedTab = [...new Set(query.taxa.flatMap((t) => t.relations))].join("; ");

  if (submitted && !isEmpty(query) && errors.length === 0) {
    // `page` belongs to whichever tab is open; the other one starts over
    const relatedOpen = relatedTab !== "" && query.tab === relatedTab;

    // `tab` is ours, not the service's
    const params = new URLSearchParams(url.searchParams);
    params.delete("tab");

    const relatedParams = new URLSearchParams(params);

    if (relatedOpen) {
      params.delete("page");
    } else {
      relatedParams.delete("page");
    }

    const relatedPromise = relatedTab ? searchRelations(fetch, relatedParams) : null;

    try {
      ({ records, matched } = await search(fetch, params));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Search failed.");
    }

    if (relatedPromise) {
      try {
        ({ records: relatedRecords, matched: relatedMatched } = await relatedPromise);
      } catch (e) {
        // a failure here must not take the main results down with it
        relatedError = e instanceof Error ? e.message : "Related records failed to load.";
      }
    }
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
    matched,
    relatedRecords,
    relatedMatched,
    relatedError,
    relatedTab,
  };
};
