import schemaFixture from '$lib/fixtures/schema.json';
import { fromParams, isEmpty, validate } from '$lib/query';
import { translate } from '$lib/esQuery';
import type { Schema } from '$lib/types';
import type { PageLoad } from './$types';

export const ssr = true;

/**
 * The URL is the state: `load` reads it and produces everything the page shows.
 * The form never fetches; submitting is a navigation.
 *
 * With no backend (D45) this stops at the translated Elasticsearch body rather
 * than sending it. That is the part worth proving.
 */
export const load: PageLoad = ({ url }) => {
	const schema = schemaFixture as Schema;
	const query = fromParams(url.searchParams);
	const submitted = url.searchParams.toString().length > 0;
	const errors = submitted
		? validate(query, schema.limits.max_result_window, schema.limits.max_per_page)
		: [];
	const translation =
		submitted && !isEmpty(query) && errors.length === 0 ? translate(query, schema) : null;

	return { schema, query, submitted, errors, translation };
};
