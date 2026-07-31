import schemaFixture from '$lib/fixtures/schema.json';
import { fromParams, isEmpty, validate } from '$lib/query';
import type { Schema } from '$lib/types';
import type { PageLoad } from './$types';

export const ssr = true;

/**
 * The URL is the state: `load` reads it and produces everything the page shows.
 * The form never fetches; submitting is a navigation.
 *
 * The search params ARE the API request — `GET /api/search?<same params>`, so
 * there is one query grammar and not two. The Rust service translates it to
 * Elasticsearch and returns the hits.
 */
export const load: PageLoad = async ({ url, fetch }) => {
	const schema = schemaFixture as Schema;
	const query = fromParams(url.searchParams);
	const submitted = url.searchParams.toString().length > 0;
	const errors = submitted
		? validate(query, schema.limits.max_result_window, schema.limits.max_per_page)
		: [];

	let hits: Record<string, unknown>[] | null = null;
	let total = 0;
	// `relation: "gte"` means the count hit `track_total_hits` — render "10,000+",
	// never a fabricated exact number (D19).
	let totalIsLowerBound = false;
	if (submitted && !isEmpty(query) && errors.length === 0) {
		try {
			const res = await fetch(`${__API_BASE__}/api/search?${url.searchParams}`);
			const body = await res.json();
			// errors come back as `{ error, message }`; ES detail is never forwarded
			if (!res.ok) errors.push(body?.message ?? `Search failed (${res.status}).`);
			else {
				// the service passes the Elasticsearch response through as-is
				hits = body.hits.hits.map((h: { _source: Record<string, unknown> }) => h._source);
				total = body.hits.total.value;
				totalIsLowerBound = body.hits.total.relation !== 'eq';
			}
		} catch {
			errors.push(`Could not reach the search service at ${__API_BASE__}.`);
		}
	}

	return { schema, query, submitted, errors, hits, total, totalIsLowerBound };
};
