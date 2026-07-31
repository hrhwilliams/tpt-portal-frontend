export type Rank = { id: string; label: string; field: string };

export type AttributeTypeDef = {
	id: string;
	label: string;
	description: string;
	/** name of the code table constraining the value, or null for free text */
	vocabulary: string | null;
	units_table: string | null;
};

export type VocabValue = {
	value: string;
	description: string;
	documentation_url: string;
};

/** A value with its record count in the current snapshot. */
export type CountedValue = { value: string; count: number };

export type GuidPrefix = CountedValue & {
	institution: string;
	collection_cde: string;
};

export type Schema = {
	snapshot_date: string;
	fixture?: boolean;
	ranks: Rank[];
	attribute_types: AttributeTypeDef[];
	vocabularies: Record<string, VocabValue[]>;
	countries: CountedValue[];
	states: CountedValue[];
	guid_prefixes: GuidPrefix[];
	sorts: { id: string; label: string }[];
	limits: { max_per_page: number; max_result_window: number; max_export_rows: number };
	nonpublic_types_dropped: string[];
};

export type Taxon = {
	rank: string;
	name: string;
	record_count: number;
	parent_rank: string | null;
	parent_name: string | null;
};

/** One row of the taxon block. Rows are OR-combined; they carry no negation. */
export type TaxonPair = {
	rank: string;
	name: string;
};

/** One row of the attribute block. */
export type AttributePair = {
	type: string;
	value: string;
	/** true = the specimen must NOT carry this (type, value) */
	negated: boolean;
};

/** How the attribute rows combine. Whole-block, not per row. */
export type BoolOp = 'and' | 'or';

export type SearchQuery = {
	/** block 1 — any of these organisms */
	taxa: TaxonPair[];
	/** block 3: which collections hold the record, not what it is.
	 *  Values OR among themselves, and AND against everything else. */
	guid_prefixes: string[];
	/** block 2 — assertions about the specimen */
	attributes: AttributePair[];
	attr_op: BoolOp;
	/** replicated into every non-negated attribute clause; refused when any row is negated */
	method: string;
	/** block 3 — one scope */
	locality: string;
	countries: string[];
	states: string[];
	collected_from: string;
	collected_to: string;
	collector_id: string;
	page: number;
	per_page: number;
	sort: string;
};

export const EMPTY_QUERY: SearchQuery = {
	taxa: [],
	guid_prefixes: [],
	attributes: [],
	attr_op: 'and',
	method: '',
	locality: '',
	countries: [],
	states: [],
	collected_from: '',
	collected_to: '',
	collector_id: '',
	page: 1,
	per_page: 50,
	sort: 'guid_asc'
};

/**
 * Not a rank. Shares the (field, value) shape of the rank rows and rides in the
 * same dropdown, but matches as a phrase against an analysed text field rather
 * than against a `.split` subfield.
 */
export const SCIENTIFIC_NAME = 'scientific_name';

/** The four detection types share one vocabulary and one flat-array fast path. */
export const DETECTION_TYPES: Record<string, string> = {
	detected: 'detected',
	'not detected': 'not_detected',
	'examined for': 'examined_for',
	'not examined for': 'not_examined_for'
};
