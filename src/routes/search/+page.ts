import { error } from "@sveltejs/kit";
import { getSchema, search } from "$lib/api";
import { fromParams, isEmpty, validate } from "$lib/query";
import type { PageLoad } from "./$types";

/**
 * The URL is the state: `load` reads it and produces everything the page shows.
 * The form never fetches; submitting is a navigation.
 *
 * The search params ARE the API request — `GET /api/search?<same params>`, so
 * there is one query grammar and not two. The Rust service translates it to
 * Elasticsearch and returns the hits.
 */
export const load: PageLoad = async ({ url, fetch }) => {
  // Issued before the search is awaited, so the two overlap. `Cache-Control:
  // max-age=900` means only the first navigation actually pays for it.
  const schemaPromise = getSchema(fetch);

  const query = fromParams(url.searchParams);
  const submitted = url.searchParams.toString().length > 0;
  const errors = submitted ? validate(query) : [];

  let records: Record<string, unknown>[] | null = null;
  // `summary.matched` comes from an aggregation, which counts exhaustively, so it
  // is exact at any size. `hits.total` saturates at `track_total_hits` and is not
  // read — which is what retires the old "10,000+" (supersedes D19). `summary`
  // also carries `context`, the pre-attribute denominator; spec 05's "x of y"
  // line is what will read it.
  let matched = 0;
  if (submitted && !isEmpty(query) && errors.length === 0) {
    try {
      ({ records, matched } = await search(fetch, url.searchParams));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Search failed.");
    }
  }

  // A failed search degrades to an error message beside the form. A failed schema
  // cannot: it is the form — every dropdown's contents come from it.
  let schema;
  try {
    schema = await schemaPromise;
  } catch (e) {
    error(503, e instanceof Error ? e.message : `Could not load the search form from ${__API_BASE__}.`);
  }

  return { schema, query, submitted, errors, records, matched };
};
