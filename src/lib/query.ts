import {
	EMPTY_QUERY,
	type AttributePair,
	type BoolOp,
	type SearchQuery,
	type TaxonPair
} from './types.ts';

/**
 * URL <-> query state. The URL is the state: nothing else drives a search.
 *
 * Both repeatable blocks serialise as repeated params:
 *
 *   taxon=species|Myodes gapperi
 *   taxon=species|Myodes rutilus     -> OR
 *   attr=examined for|ectoparasite
 *   attr=!detected|ectoparasite      -> `!` negates
 *   attr_op=or                       -> absent means AND
 *
 * Split on the FIRST `|` only. Ranks and attribute types are controlled and
 * cannot contain one; free-text attribute values routinely do (`reproductive
 * data` uses `|` as its own internal separator), as do taxon names in theory.
 */

function splitOnce(s: string): [string, string] | null {
	const i = s.indexOf('|');
	if (i < 0) return null;
	return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

function decodeTaxon(raw: string): TaxonPair | null {
	const parts = splitOnce(raw);
	if (!parts) return null;
	const [rank, name] = parts;
	if (!name) return null;
	return { rank, name };
}

function decodeAttr(raw: string): AttributePair | null {
	let s = raw;
	let negated = false;
	if (s.startsWith('!')) {
		negated = true;
		s = s.slice(1);
	}
	// no `|` means no value: "carries this attribute type at all"
	const parts = splitOnce(s) ?? [s.trim(), ''];
	const [type, value] = parts;
	if (!type) return null;
	return { type, value, negated };
}

export function toParams(q: SearchQuery): URLSearchParams {
	const p = new URLSearchParams();
	// empty inputs are absent, never `&locality=` — keeps a shared link canonical
	const put = (k: string, v: string) => {
		if (v && v.trim()) p.set(k, v.trim());
	};
	for (const t of q.taxa) {
		if (t.name) p.append('taxon', `${t.rank}|${t.name}`);
	}
	for (const a of q.attributes) {
		if (!a.type) continue;
		const v = a.value.trim();
		p.append('attr', `${a.negated ? '!' : ''}${a.type}${v ? `|${v}` : ''}`);
	}
	if (q.attr_op === 'or' && q.attributes.length > 1) p.set('attr_op', 'or');
	if (!hasNegatedRow(q)) put('method', q.method);
	for (const gp of q.guid_prefixes) {
		if (gp) p.append('prefix', gp);
	}
	put('locality', q.locality);
	for (const c of q.countries) {
		if (c) p.append('country', c);
	}
	for (const st of q.states) {
		if (st) p.append('state', st);
	}
	put('from', q.collected_from);
	put('to', q.collected_to);
	put('collector', q.collector_id);
	if (q.page > 1) p.set('page', String(q.page));
	if (q.per_page !== 50) p.set('per_page', String(q.per_page));
	if (q.sort !== 'guid_asc') p.set('sort', q.sort);
	return p;
}

export function fromParams(p: URLSearchParams): SearchQuery {
	const taxa = p
		.getAll('taxon')
		.map(decodeTaxon)
		.filter((t): t is TaxonPair => t !== null);

	// Links published before the taxon block became repeatable used a single
	// `rank=` + `taxon=` pair. D17 makes shared URLs a public API, so they keep
	// working: read the old form as one row.
	if (!taxa.length) {
		const legacyName = p.get('taxon');
		if (legacyName && !legacyName.includes('|')) {
			taxa.push({ rank: p.get('rank') ?? '', name: legacyName });
		}
	}

	const q: SearchQuery = {
		...EMPTY_QUERY,
		taxa,
		attributes: p
			.getAll('attr')
			.map(decodeAttr)
			.filter((a): a is AttributePair => a !== null),
		attr_op: (p.get('attr_op') === 'or' ? 'or' : 'and') as BoolOp,
		guid_prefixes: p.getAll('prefix').filter(Boolean),
		method: p.get('method') ?? '',
		locality: p.get('locality') ?? '',
		countries: p.getAll('country').filter(Boolean),
		states: p.getAll('state').filter(Boolean),
		collected_from: p.get('from') ?? '',
		collected_to: p.get('to') ?? '',
		collector_id: p.get('collector') ?? '',
		page: Math.max(1, Number(p.get('page') ?? 1) || 1),
		per_page: Number(p.get('per_page') ?? 50) || 50,
		sort: p.get('sort') ?? 'guid_asc'
	};
	// a hand-edited link could carry both; the form cannot produce it
	if (hasNegatedRow(q)) q.method = '';
	return q;
}

export function hasNegatedRow(q: SearchQuery): boolean {
	return q.attributes.some((a) => a.negated && a.type);
}

export function isEmpty(q: SearchQuery): boolean {
	return !(
		q.taxa.some((t) => t.name) ||
		q.guid_prefixes.length > 0 ||
		q.attributes.some((a) => a.type) ||
		q.locality ||
		q.countries.length > 0 ||
		q.states.length > 0 ||
		q.collected_from ||
		q.collected_to ||
		q.collector_id
	);
}

/** Client-side mirror of the API's validation. The backend stays authoritative. */
export function validate(q: SearchQuery, maxWindow = 10000, maxPerPage = 200): string[] {
	const errors: string[] = [];
	if (isEmpty(q)) errors.push('Enter at least one filter — an unconstrained search is refused.');
	if (q.collected_from && q.collected_to && q.collected_from > q.collected_to)
		errors.push('Collection date range starts after it ends.');
	if (q.per_page > maxPerPage) errors.push(`Page size is capped at ${maxPerPage}.`);
	if ((q.page - 1) * q.per_page + q.per_page > maxWindow)
		errors.push(
			`Only the first ${maxWindow.toLocaleString()} results can be browsed. Narrow the search, or export.`
		);
	for (const t of q.taxa) {
		if (t.name && !t.rank) errors.push(`Taxon "${t.name}" has no rank.`);
	}
	// a row with no value is legal: "carries this attribute type at all"
	if (q.method && hasNegatedRow(q))
		errors.push('Method cannot be combined with a negated attribute row.');
	return errors;
}
