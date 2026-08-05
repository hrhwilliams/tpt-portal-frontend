import schemaFixture from '$lib/fixtures/schema.json';
import { fromParams, isEmpty, validate } from '$lib/query';
import type { Schema } from '$lib/types';
import type { PageLoad } from './$types';

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
	const errors = submitted ? validate(query) : [];

	let records: Record<string, unknown>[] | null = null;
	// `summary` comes from aggregations, which count exhaustively — both figures are
	// exact at any size. `hits.total` still saturates at `track_total_hits` and is
	// not read, which is what retires the old "10,000+" (supersedes D19).
	let matched = 0;
	// everything except the attribute block — the denominator `matched` came out of
	let context = 0;
	if (submitted && !isEmpty(query) && errors.length === 0) {
		try {
			const res = await fetch(`${__API_BASE__}/api/search?${url.searchParams}`);
			const body = await res.json();
			// errors come back as `{ error, message }`; ES detail is never forwarded
			if (!res.ok) errors.push(body?.message ?? `Search failed (${res.status}).`);
			else {
				records = body.records;
				matched = body.summary.matched;
				context = body.summary.context;
			}
		} catch {
			errors.push(`Could not reach the search service at ${__API_BASE__}.`);
		}
	}

	return { schema, query, submitted, errors, records, matched, context };
};
