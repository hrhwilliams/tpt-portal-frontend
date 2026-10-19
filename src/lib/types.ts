export type Rank = { id: string; label: string; field: string };

export type AttributeTypeDef = {
  id: string;
  label: string;
  description: string;
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
  /** part fields searchable by `part=field|value`, e.g. `part_name`, `disposition` */
  part_fields: AttributeTypeDef[];
  vocabularies: Record<string, VocabValue[]>;
  countries: CountedValue[];
  states: CountedValue[];
  collectors: CountedValue[];
  relations: { value: string; description: string }[];
  guid_prefixes: GuidPrefix[];
  sorts: { id: string; label: string }[];
  limits: {
    page_size: number;
    max_per_page: number;
    max_result_window: number;
    max_export_rows: number;
  };
  nonpublic_types_dropped: string[];
};

/** Statistics over one whole result set: the matched records, or the records related to them. */
export type SummaryBlock = {
  matched: number;
  distinct: { taxa: number; localities: number; collectors: number };
  /** collecting years, null when nothing in the set is dated */
  years: { min: number; max: number } | null;
  /** top values by record count, descending */
  facets: {
    taxa: CountedValue[];
    countries: CountedValue[];
    states: CountedValue[];
    collections: CountedValue[];
  };
};

/** The records reached by one relationship, e.g. everything the matched records are a `host of parasite` to. */
export type RelationSummary = SummaryBlock & {
  relation: string;
  /**
   * Distinct (record, related record) links by this relationship. Not shown:
   * the gap between it and `matched` is an artefact of one animal catalogued
   * twice, which is a curation detail rather than something to act on.
   */
  pairings: number;
};

export type Summary = {
  records: SummaryBlock;
  /** one block per relationship the query names, empty when it names none */
  related: RelationSummary[];
  /** plain-English restatement of the query */
  description: string | null;
};

export type Taxon = {
  rank: string;
  name: string;
  record_count: number;
  parent_rank: string | null;
  parent_name: string | null;
};

/** The other party in a pairwise relationship search. */
export type RelatedTaxon = {
  rank: string;
  name: string;
};

export type TaxonPair = {
  rank: string;
  name: string;
  relations: string[];
  related: RelatedTaxon[];
};

export type AttributePair = {
  type: string;
  values: string[];
  negated: boolean;
};

/** How the attribute rows combine. */
export type BoolOp = "and" | "or";

export type SearchQuery = {
  taxa: TaxonPair[];
  guid_prefixes: string[];
  detectionAttributes: AttributePair[];
  otherAttributes: AttributePair[];
  attr_op: BoolOp;
  /** `type` is a part field; rows always AND */
  parts: AttributePair[];
  method: string;
  locality: string;
  countries: string[];
  states: string[];
  collected_from: string;
  collected_to: string;
  agent: string;
  /** The relationship whose tab is open, e.g. `parasite of`. Empty is the records tab. */
  tab: string;
  page: number;
};

export const EMPTY_QUERY: SearchQuery = {
  taxa: [],
  guid_prefixes: [],
  detectionAttributes: [],
  otherAttributes: [],
  attr_op: "and",
  parts: [],
  method: "",
  locality: "",
  countries: [],
  states: [],
  collected_from: "",
  collected_to: "",
  agent: "",
  tab: "",
  page: 1,
};
