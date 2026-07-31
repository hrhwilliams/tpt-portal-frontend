import {
	DETECTION_TYPES,
	SCIENTIFIC_NAME,
	type AttributePair,
	type Schema,
	type SearchQuery
} from './types.ts';

/**
 * Request -> Elasticsearch query body.
 *
 * This belongs in the Rust service, not the browser. It lives here so the proof
 * of concept can show the query the form produces, which is the only way to see
 * that the correlation rules hold. Treat it as an executable statement of the
 * contract, not as production code.
 *
 * The form is three blocks, AND-combined:
 *
 *   (taxon OR taxon …) AND (attribute AND|OR attribute …) AND (scope …)
 *
 * Rules it exists to demonstrate:
 *
 *  1. Conditions that must hold together sit inside ONE `nested` clause. One
 *     attribute row = one clause carrying type, value and method. Two rows are
 *     two clauses, which is correct: they are two independent assertions about
 *     two different attribute records.
 *  2. Searches hit the analysed subfield, never the bare keyword —
 *     `.hierarchy` for attribute values, `.split` for taxonomy. The bare field
 *     is for display, aggregation and CSV. Querying it drops matches silently.
 *  3. Event date and locality go in one clause, so they describe the same visit.
 *     The third block is a presentation grouping, not a query grouping: country,
 *     state and collector are record-level, while locality and date are per
 *     event.
 */

type Clause = Record<string, unknown>;

export type Translation = {
	body: Clause;
	/** human-readable notes about why the query looks the way it does */
	notes: string[];
};

const SOURCE = [
	'guid',
	'guid_prefix',
	'scientific_name',
	'family',
	'genus',
	'species',
	'country',
	'state_prov',
	'events',
	'event_date_min',
	'event_date_max',
	'use_license_url'
];

const anyOf = (clauses: Clause[]): Clause =>
	clauses.length === 1 ? clauses[0] : { bool: { should: clauses, minimum_should_match: 1 } };

/**
 * One attribute row -> one clause. `method` is null for negated rows.
 *
 * The value is optional. Without one the row asks "carries this attribute type
 * at all" — examined for *anything*, rather than for a named thing.
 */
function attributeClause(pair: AttributePair, method: string | null): Clause {
	const flatField = DETECTION_TYPES[pair.type];
	const value = pair.value.trim();

	// Fast path: a detection-type row with no method needs no nested query at
	// all. The flat arrays are built from the same parse as the nested docs, so
	// the two cannot disagree. With no value, presence of the array is the test.
	if (flatField && !method) {
		return value
			? { term: { [`${flatField}.hierarchy`]: value } }
			: { exists: { field: flatField } };
	}

	const filter: Clause[] = [{ term: { 'attributedetail.attribute_type': pair.type } }];
	if (value) {
		filter.push({ term: { 'attributedetail.attribute_value.hierarchy': value } });
	}
	if (method) {
		filter.push({ match_phrase: { 'attributedetail.attribute_method': method } });
	}
	return { nested: { path: 'attributedetail', query: { bool: { filter } } } };
}

export function translate(q: SearchQuery, schema: Schema): Translation {
	const filter: Clause[] = [];
	const must_not: Clause[] = [];
	const notes: string[] = [];

	// ---- block 1: taxon, OR --------------------------------------------------
	const taxonClauses: Clause[] = [];
	let usedRank = false;
	for (const t of q.taxa) {
		if (!t.name) continue;
		const field = schema.ranks.find((r) => r.id === t.rank)?.field;
		if (!field) continue;
		if (t.rank === SCIENTIFIC_NAME) {
			// Not a rank column: `scientific_name` is analysed text with no `.split`
			// subfield, so a binomial matches as a phrase. Case-insensitive, and
			// tolerant of the authorship that sits alongside it in some records.
			taxonClauses.push({ match_phrase: { scientific_name: t.name } });
		} else {
			taxonClauses.push({ match: { [`${field}.split`]: t.name } });
			usedRank = true;
		}
	}
	if (taxonClauses.length) {
		filter.push(anyOf(taxonClauses));
		if (usedRank) {
			notes.push(
				'Taxonomy matches the `.split` subfield, not the bare keyword — rank columns hold ' +
					'several `; `-joined names on some records, and exact matching misses those silently.'
			);
		}
		if (taxonClauses.length > 1) {
			notes.push(
				`${taxonClauses.length} taxon rows are OR-combined (\`minimum_should_match: 1\`): a ` +
					'specimen matching any one of them qualifies.'
			);
		}
	}

	// ---- block 2: attributes, AND or OR ------------------------------------
	const rows = q.attributes.filter((a) => a.type);
	const negated = rows.some((a) => a.negated);
	const method = negated ? '' : q.method.trim();

	if (negated && q.method.trim()) {
		notes.push(
			'Method was dropped: it cannot be combined with a negated row. "No detected-X row by ' +
				'this method" still matches a specimen with a positive found another way.'
		);
	}

	if (rows.length) {
		if (q.attr_op === 'or') {
			// A negated row inside an OR reads as "… or does not carry this".
			const clauses = rows.map((r) =>
				r.negated
					? { bool: { must_not: [attributeClause(r, null)] } }
					: attributeClause(r, method || null)
			);
			filter.push(anyOf(clauses));
			if (rows.length > 1) {
				notes.push(
					`${rows.length} attribute rows are OR-combined: a specimen matching any one of ` +
						'them qualifies.'
				);
			}
		} else {
			for (const row of rows) {
				if (row.negated) must_not.push(attributeClause(row, null));
				else filter.push(attributeClause(row, method || null));
			}
			if (rows.length > 1) {
				notes.push(
					`${rows.length} attribute rows are AND-combined, producing ${rows.length} separate ` +
						'clauses — each describes a different attribute record on the specimen.'
				);
			}
		}
	}

	if (method && rows.filter((r) => !r.negated).length > 1) {
		notes.push(
			'The method condition is replicated inside every clause, so it is correlated with each ' +
				'value rather than matching some unrelated attribute record.'
		);
	}
	if (rows.some((r) => !r.negated && DETECTION_TYPES[r.type]) && !method) {
		notes.push(
			'Detection rows with no method take the flat-array fast path — a plain `term`, no ' +
				'nested query. Results are identical to the nested form.'
		);
	}
	if (rows.some((r) => r.value.includes(':'))) {
		notes.push(
			'Values match against `.hierarchy`, so searching a parent term also finds its children ' +
				'(and a parent-level examination pairs with a child-level outcome).'
		);
	}
	if (rows.some((r) => !r.value.trim())) {
		notes.push(
			'A row with no value asks whether the attribute is recorded at all, whatever its value.'
		);
	}

	// Collection, not identity: AND-ed against the taxon block rather than OR-ed
	// into it, or a prefix would return the whole collection regardless of taxon.
	const prefixes = q.guid_prefixes.filter(Boolean);
	if (prefixes.length) {
		// `guid_prefix` is an exact keyword, so `terms` is the OR — cheaper than a
		// `should` of `term`s and it needs no analysis.
		filter.push(
			prefixes.length === 1
				? { term: { guid_prefix: prefixes[0] } }
				: { terms: { guid_prefix: prefixes } }
		);
		if (prefixes.length > 1) {
			notes.push(`${prefixes.length} collections are OR-combined into one \`terms\` clause.`);
		}
		if (taxonClauses.length > 1) {
			notes.push(
				'The collection filter is AND-ed against the taxon block, not OR-ed into it: it ' +
					'narrows which records qualify rather than adding more.'
			);
		}
	}

	// ---- block 3: scope ----------------------------------------------------
	// Record-level. These are NOT correlated with the event date.
	for (const [field, values] of [
		['country', q.countries],
		['state_prov', q.states]
	] as const) {
		const v = values.filter(Boolean);
		if (v.length) {
			filter.push(v.length === 1 ? { term: { [field]: v[0] } } : { terms: { [field]: v } });
		}
	}
	if (q.collector_id) filter.push({ term: { collector_ids: q.collector_id } });

	// Per event, and in ONE clause so they describe the same visit.
	const eventFilter: Clause[] = [];
	if (q.locality) eventFilter.push({ term: { 'events.locality_search_terms': q.locality } });
	if (q.collected_from || q.collected_to) {
		const range: Record<string, string> = {};
		if (q.collected_from) range.gte = q.collected_from;
		if (q.collected_to) range.lte = q.collected_to;
		eventFilter.push({ range: { 'events.began_date': range } });
	}
	if (eventFilter.length) {
		filter.push({ nested: { path: 'events', query: { bool: { filter: eventFilter } } } });
		if (eventFilter.length > 1) {
			notes.push(
				'Locality and collection date are one nested clause, so they must hold for the same ' +
					'event. Two sibling clauses would match a specimen collected at the place on one ' +
					'visit and in the date range on another.'
			);
		}
		notes.push(
			'Date filtering runs per event, not on the record-level date — a specimen with two ' +
				'collecting events is missed by the top-level date.'
		);
	}
	if ((q.countries.length || q.states.length) && eventFilter.length) {
		notes.push(
			'Country and state are record-level and are NOT correlated with the event date: the ' +
				'source carries no per-event political geography.'
		);
	}

	const bool: Clause = { filter };
	if (must_not.length) bool.must_not = must_not;

	const sort: Clause[] =
		q.sort === 'date_desc'
			? [{ event_date_max: { order: 'desc' } }, { guid: 'asc' }]
			: q.sort === 'date_asc'
				? [{ event_date_min: { order: 'asc' } }, { guid: 'asc' }]
				: [{ guid: 'asc' }];

	return {
		body: {
			track_total_hits: 10000,
			from: (q.page - 1) * q.per_page,
			size: q.per_page,
			sort,
			_source: SOURCE,
			query: { bool }
		},
		notes
	};
}
