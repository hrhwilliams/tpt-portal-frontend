/**
 * Everything in this half of the file describes `GET /api/schema`. It is a
 * decoding contract, not a source of truth: fields the form does not read yet
 * (`Rank.field`, `units_table`, `limits.max_export_rows`) stay because the
 * service sends them and spec 03 says what they are for.
 */

/** `scientific_name` rides here too. Not a rank — the service says how it matches. */
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
  ranks: Rank[];
  attribute_types: AttributeTypeDef[];
  vocabularies: Record<string, VocabValue[]>;
  countries: CountedValue[];
  states: CountedValue[];
  /** `relations.relationship` — how a record relates to another cataloged item */
  relations: { value: string; description: string }[];
  guid_prefixes: GuidPrefix[];
  sorts: { id: string; label: string }[];
  /** The bounds the service enforces. Read, never restated in TypeScript. */
  limits: {
    /** fixed server-side; the API takes no `per_page` */
    page_size: number;
    max_per_page: number;
    /** Elasticsearch's `max_result_window` — browsing stops here */
    max_result_window: number;
    max_export_rows: number;
  };
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
  /** Relationships this record carries to another cataloged item. Empty = any.
   *  Several OR within the row; they are an extra condition on the record, not
   *  a statement about the related record's taxonomy. */
  relations: string[];
};

/** One row of the attribute block. */
export type AttributePair = {
  type: string;
  /** Empty = "carries this attribute type at all". Several values OR within
   *  the row; there is no parent/child expansion, so `ectoparasite` means
   *  exactly that and children are picked explicitly. */
  values: string[];
  /** true = the specimen must NOT carry this */
  negated: boolean;
};

/** How the attribute rows combine. Whole-block, not per row. */
export type BoolOp = "and" | "or";

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
  sort: string;
};

export const EMPTY_QUERY: SearchQuery = {
  taxa: [],
  guid_prefixes: [],
  attributes: [],
  attr_op: "and",
  method: "",
  locality: "",
  countries: [],
  states: [],
  collected_from: "",
  collected_to: "",
  collector_id: "",
  page: 1,
  sort: "guid_asc",
};
