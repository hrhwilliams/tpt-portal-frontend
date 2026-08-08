import { error } from "@sveltejs/kit";
import { getSchema, search } from "$lib/api";
import { fromParams, isEmpty } from "$lib/query";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url, fetch }) => {
  const schemaPromise = getSchema(fetch);

  const query = fromParams(url.searchParams);
  const submitted = url.searchParams.toString().length > 0;
  const errors: string[] = [];

  let records: Record<string, unknown>[] | null = null;
  let matched = 0;
  if (submitted && !isEmpty(query) && errors.length === 0) {
    try {
      ({ records, matched } = await search(fetch, url.searchParams));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Search failed.");
    }
  }

  let schema;
  try {
    schema = await schemaPromise;
  } catch (e) {
    error(503, e instanceof Error ? e.message : `Could not load the search form from ${__API_BASE__}.`);
  }

  return { schema, query, submitted, errors, records, matched };
};
