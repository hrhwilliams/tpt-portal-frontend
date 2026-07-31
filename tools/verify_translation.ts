/* eslint-disable @typescript-eslint/no-explicit-any --
   This harness walks an arbitrary Elasticsearch query body looking for shapes.
   Typing that structure would mean modelling the ES DSL, which is the thing
   under test. `any` is the honest type here. */
/**
 * Asserts the query translator emits the shapes the design requires.
 *
 *   node --experimental-strip-types tools/verify_translation.ts
 *
 * These are the rules whose violation returns fewer results with no error, so
 * they are checked structurally rather than by eye.
 */
import { readFileSync } from 'node:fs';
import { fromParams, isEmpty, toParams } from '../src/lib/query.ts';
import { translate } from '../src/lib/esQuery.ts';
import type { Schema } from '../src/lib/types.ts';

const schema = JSON.parse(
	readFileSync(new URL('../src/lib/fixtures/schema.json', import.meta.url), 'utf8')
) as Schema;

const body = (qs: string) => translate(fromParams(new URLSearchParams(qs)), schema).body as any;
const json = (v: unknown) => JSON.stringify(v);

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n        ${detail}`}`);
}

// 1 — value + method must be ONE nested clause, never siblings
{
	const b = body('attr=detected|virus: Orthohantavirus&method=immunoblot');
	const nested = b.query.bool.filter.filter((c: any) => c.nested?.path === 'attributedetail');
	check(
		'one attribute row + method = exactly one nested clause',
		nested.length === 1,
		json(b.query.bool.filter)
	);
	const inner = nested[0].nested.query.bool.filter;
	check(
		'  that clause carries type, value and method together',
		inner.length === 3 &&
			json(inner).includes('attributedetail.attribute_value') &&
			json(inner).includes('attribute_method')
	);
}

// 2 — the analysed subfield, never the bare keyword
{
	const b = body('taxon=subfamily|Arvicolinae&attr=detected|endoparasite: cestode');
	const s = json(b.query);
	check(
		'taxonomy queries subfamily.split',
		s.includes('subfamily.split') && !s.includes('"subfamily":')
	);
	check('detection queries the flat keyword exactly', s.includes('"detected":["endoparasite'));
}

// 3 — event date and locality in one clause, so they describe the same visit
{
	const b = body('locality=Isle Royale National Park&from=1994-01-01&to=1994-12-31');
	const ev = b.query.bool.filter.filter((c: any) => c.nested?.path === 'events');
	check('locality + date = one events clause', ev.length === 1, json(b.query.bool.filter));
	check('  carrying both conditions', ev[0].nested.query.bool.filter.length === 2);
}

// 4 — flat fast path for an unnegated detection row with no method
{
	const b = body('attr=detected|endoparasite: cestode');
	check(
		'detection row, no method -> flat term, no nested query',
		json(b.query).includes('"detected"') && !json(b.query).includes('nested'),
		json(b.query)
	);
}

// 5 — negation compiles to must_not, and drops method
{
	const b = body('attr=examined for|ectoparasite&attr=!detected|ectoparasite&method=comb');
	check('negated row lands in must_not', b.query.bool.must_not?.length === 1, json(b.query));
	check(
		'  method is dropped entirely when a row is negated',
		!json(b.query).includes('attribute_method'),
		json(b.query)
	);
	check(
		'  the must_not targets the flat detection array',
		json(b.query.bool.must_not).includes('"detected"')
	);
}

// 6 — several rows are several clauses; method replicates into each
{
	const b = body('attr=detected|virus: Orthohantavirus&attr=examined for|ectoparasite&method=comb');
	const nested = b.query.bool.filter.filter((c: any) => c.nested?.path === 'attributedetail');
	check('two rows -> two independent nested clauses', nested.length === 2);
	check(
		'  method appears inside both',
		nested.every((n: any) => json(n).includes('attribute_method')),
		json(nested)
	);
}

// 7 — non-detection types use the same mechanism
{
	const b = body('attr=sex|female&attr=life stage|juvenile');
	const nested = b.query.bool.filter.filter((c: any) => c.nested?.path === 'attributedetail');
	check(
		'non-detection attributes go nested (no flat array exists)',
		nested.length === 2,
		json(b.query.bool.filter)
	);
}

// 8 — non-public types are absent from the schema the client is given
{
	const ids = new Set(schema.attribute_types.map((t) => t.id));
	check(
		'public: 0 types are not offered',
		!ids.has('restricted data') && !ids.has('NAGPRA category') && !ids.has('value')
	);
	check('  and are recorded as dropped', schema.nonpublic_types_dropped.length === 3);
}

// 9 — URL round-trip, including a value containing the row delimiter
{
	const qs = 'taxon=genus|Sorex&attr=!detected|a|b&attr=examined for|ectoparasite';
	const q = fromParams(new URLSearchParams(qs));
	check(
		'value containing "|" survives the round trip',
		q.attributes[0].values.join() === 'a|b' && q.attributes[0].negated === true,
		json(q.attributes)
	);
	check('  and a second row parses independently', q.attributes[1].type === 'examined for');
}

// 10 — never filter on the sort-only rollups
{
	const b = body('attr=detected|ectoparasite&sort=date_desc');
	check(
		'event_date_max is used for sort only, never in the filter',
		json(b.sort).includes('event_date_max') && !json(b.query).includes('event_date')
	);
}

// 11 — the taxon block is OR, and must never be AND-ed
{
	const b = body('taxon=species|Myodes gapperi&taxon=species|Myodes rutilus');
	const f = b.query.bool.filter;
	check('two taxon rows collapse to ONE clause, not two', f.length === 1, json(f));
	const sh = f[0].bool?.should;
	check(
		'  that clause is a should with minimum_should_match: 1',
		Array.isArray(sh) && sh.length === 2 && f[0].bool.minimum_should_match === 1,
		json(f[0])
	);
	check('  both sides query species.split', json(sh).split('species.split').length === 3, json(sh));
}

// 12 — one taxon row stays a bare clause (no pointless should wrapper)
{
	const b = body('taxon=genus|Sorex');
	check('single taxon row emits a bare match', !!b.query.bool.filter[0].match, json(b.query));
}

// 13 — taxon rows may mix ranks
{
	const b = body('taxon=genus|Sorex&taxon=family|Cricetidae');
	const sh = b.query.bool.filter[0].bool.should;
	check(
		'mixed-rank OR maps each row to its own field',
		json(sh).includes('genus.split') && json(sh).includes('family.split'),
		json(sh)
	);
}

// 14 — attribute OR mode
{
	const b = body('attr=detected|ectoparasite&attr=detected|endoparasite&attr_op=or');
	const f = b.query.bool.filter;
	check(
		'OR mode collapses attribute rows to one should clause',
		f.length === 1 && f[0].bool?.minimum_should_match === 1,
		json(f)
	);
	check('  and does not leave a stray must_not', !b.query.bool.must_not, json(b.query));
}

// 15 — a negated row inside OR reads as "or does not carry this"
{
	const b = body('attr=detected|ectoparasite&attr=!detected|endoparasite&attr_op=or');
	const sh = b.query.bool.filter[0].bool.should;
	check(
		'negated row in OR becomes a nested must_not, not a top-level one',
		sh.length === 2 && !!sh[1].bool?.must_not && !b.query.bool.must_not,
		json(b.query)
	);
}

// 16 — AND remains the default when attr_op is absent
{
	const b = body('attr=detected|ectoparasite&attr=detected|endoparasite');
	check(
		'absent attr_op means AND — two sibling clauses',
		b.query.bool.filter.length === 2,
		json(b.query.bool.filter)
	);
}

// 17 — locality and date stay in one events clause, with scope fields outside it
{
	const b = body('locality=Isle Royale National Park&from=2024-01-01&to=2026-12-31&state=Alaska');
	const ev = b.query.bool.filter.filter((c: any) => c.nested?.path === 'events');
	check(
		'block 3 splits: one events clause, state outside it',
		ev.length === 1 &&
			ev[0].nested.query.bool.filter.length === 2 &&
			json(b.query.bool.filter).includes('"state_prov"'),
		json(b.query.bool.filter)
	);
}

// 18 — the worked example from the design discussion
{
	const b = body(
		'taxon=species|Myodes gapperi&taxon=species|Myodes rutilus' +
			'&attr=examined for|ectoparasite&attr=detected|ectoparasite' +
			'&state=Alaska&from=2024-01-01&to=2026-12-31'
	);
	const f = b.query.bool.filter;
	const taxonBlock = f.filter((c: any) => c.bool?.should).length;
	const attrTerms = f.filter((c: any) => c.terms?.detected || c.terms?.examined_for).length;
	const ev = f.filter((c: any) => c.nested?.path === 'events').length;
	check(
		'(taxonA OR taxonB) AND (attr AND attr) AND (scope)',
		taxonBlock === 1 && attrTerms === 2 && ev === 1 && json(f).includes('"state_prov"'),
		json(f)
	);
}

// 19 — pre-existing single-taxon links keep working (D17: URLs are a public API)
{
	const q = fromParams(new URLSearchParams('rank=genus&taxon=Sorex'));
	check(
		'legacy rank= + taxon= parses as one taxon row',
		q.taxa.length === 1 && q.taxa[0].rank === 'genus' && q.taxa[0].name === 'Sorex',
		json(q.taxa)
	);
}

// 20 — scientific_name is a phrase match on analysed text, not a .split field
{
	const b = body('taxon=scientific_name|Myodes gapperi');
	const f = b.query.bool.filter;
	check(
		'scientific_name uses match_phrase on the text field',
		!!f[0].match_phrase?.scientific_name && !json(f).includes('.split'),
		json(f)
	);
}

// 21 — a binomial ORs with a rank row, each hitting its own field
{
	const b = body('taxon=scientific_name|Myodes gapperi&taxon=genus|Sorex');
	const sh = b.query.bool.filter[0].bool.should;
	check(
		'binomial and rank OR together, each on its own field',
		sh.length === 2 && json(sh).includes('match_phrase') && json(sh).includes('genus.split'),
		json(sh)
	);
}

// 22 — guid_prefix is AND-ed, never folded into the taxon should
{
	const b = body('taxon=genus|Sorex&taxon=genus|Myodes&prefix=MSB:Mamm');
	const f = b.query.bool.filter;
	const should = f.find((c: any) => c.bool?.should);
	check(
		'collection filter is a sibling of the taxon block, not inside it',
		!!f.find((c: any) => c.term?.guid_prefix === 'MSB:Mamm') &&
			!json(should).includes('guid_prefix'),
		json(f)
	);
}

// 23 — collection alone is a valid search
{
	const q = fromParams(new URLSearchParams('prefix=MSB:Para'));
	check('a bare collection filter is not an empty query', !isEmpty(q), json(q.guid_prefixes));
}

// 24 — the schema offers real collections, and scientific_name leads the ranks
{
	check('74 collections are offered', schema.guid_prefixes.length === 74);
	check('  MSB:Mamm is the largest', schema.guid_prefixes[0].value === 'MSB:Mamm');
	check('scientific_name is the first name selector', schema.ranks[0].id === 'scientific_name');
}

// 25 — several collections OR into one terms clause, still AND-ed with taxa
{
	const b = body('taxon=genus|Sorex&prefix=MSB:Mamm&prefix=MSB:Para&prefix=UAM:Mamm');
	const f = b.query.bool.filter;
	const t = f.find((c: any) => c.terms?.guid_prefix);
	check(
		'three collections become one terms clause',
		!!t && t.terms.guid_prefix.length === 3,
		json(f)
	);
	check(
		'  and it stays a sibling of the taxon clause, not inside it',
		f.some((c: any) => c.match?.['genus.split']) &&
			!json(f.find((c: any) => c.match)).includes('guid_prefix'),
		json(f)
	);
}

// 26 — one collection still emits the cheaper term
{
	const b = body('prefix=MSB:Para');
	check(
		'a single collection uses term, not terms',
		!!b.query.bool.filter[0].term?.guid_prefix && !json(b.query).includes('"terms"'),
		json(b.query)
	);
}

// 27 — repeated prefix params round-trip in order
{
	const q = fromParams(new URLSearchParams('prefix=MSB:Mamm&prefix=MSB:Para'));
	check(
		'repeated prefix params parse to an ordered array',
		q.guid_prefixes.join(',') === 'MSB:Mamm,MSB:Para',
		json(q.guid_prefixes)
	);
}

// 27b — a row with no value asks whether the attribute is recorded at all
{
	const b = body('attr=examined for');
	check(
		'valueless detection row -> exists on the flat field',
		!!b.query.bool.filter[0].exists && b.query.bool.filter[0].exists.field === 'examined_for',
		json(b.query.bool.filter)
	);
}
{
	const b = body('attr=examined for&method=comb');
	const inner = b.query.bool.filter[0].nested.query.bool.filter;
	check(
		'  with a method it is a nested clause carrying type + method only',
		inner.length === 2 && !json(inner).includes('attribute_value'),
		json(inner)
	);
}
{
	const b = body('attr=weight');
	const inner = b.query.bool.filter[0].nested.query.bool.filter;
	check(
		'  a valueless non-detection row filters on type alone',
		inner.length === 1 && inner[0].term['attributedetail.attribute_type'] === 'weight',
		json(inner)
	);
}
{
	const q = fromParams(new URLSearchParams('attr=examined for'));
	check(
		'a valueless row is a real filter, not an empty query',
		!isEmpty(q) && q.attributes[0].values.length === 0,
		json(q.attributes)
	);
	check(
		'  and round-trips without a trailing pipe',
		toParams(q).toString().includes('attr=examined+for') && !toParams(q).toString().includes('%7C'),
		toParams(q).toString()
	);
}

// 27c — several values on one row OR into a single terms clause
{
	const b = body('attr=detected|ectoparasite: flea; ectoparasite: louse');
	const f = b.query.bool.filter;
	check(
		'two values on one row -> one terms clause on the flat field',
		f.length === 1 && f[0].terms?.detected?.length === 2,
		json(f)
	);
	check(
		'  values are exact, with no ancestor expansion',
		!json(f).includes('hierarchy') && !json(f).includes('"ectoparasite"'),
		json(f)
	);
}
{
	const b = body('attr=sex|male; female');
	const inner = b.query.bool.filter[0].nested.query.bool.filter;
	check(
		'multi-value on a nested (non-detection) row uses terms too',
		!!inner.find((c: any) => c.terms?.['attributedetail.attribute_value']?.length === 2),
		json(inner)
	);
}
{
	const q = fromParams(new URLSearchParams('attr=detected|a; b; c'));
	check('values round-trip through the URL', q.attributes[0].values.join(',') === 'a,b,c');
	check('  and re-encode canonically', toParams(q).get('attr') === 'detected|a; b; c');
}

// 28 — country and state are multi-valued, and OR within each field
{
	const b = body('country=United States&country=Mexico&state=Alaska');
	const f = b.query.bool.filter;
	const c = f.find((x: any) => x.terms?.country);
	check('two countries become one terms clause', !!c && c.terms.country.length === 2, json(f));
	check(
		'  a single state still uses term',
		!!f.find((x: any) => x.term?.state_prov === 'Alaska'),
		json(f)
	);
}

// 29 — repeated country/state params round-trip
{
	const q = fromParams(new URLSearchParams('country=Mexico&country=Panama&state=Chihuahua'));
	check(
		'country and state parse to arrays',
		q.countries.join(',') === 'Mexico,Panama' && q.states.join(',') === 'Chihuahua',
		json([q.countries, q.states])
	);
}

// 30 — the schema carries real place lists, not a hardcoded stub
{
	check('117 countries with counts', schema.countries.length === 117);
	check('488 states with counts', schema.states.length === 488);
	check('  ordered by count', schema.countries[0].value === 'United States');
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
