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

export type Taxon = {
  rank: string;
  name: string;
  record_count: number;
  parent_rank: string | null;
  parent_name: string | null;
};

export type TaxonPair = {
  rank: string;
  name: string;
  relations: string[];
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
  method: string;
  locality: string;
  countries: string[];
  states: string[];
  collected_from: string;
  collected_to: string;
  agent: string;
  page: number;
};

export const EMPTY_QUERY: SearchQuery = {
  taxa: [],
  guid_prefixes: [],
  detectionAttributes: [],
  otherAttributes: [],
  attr_op: "and",
  method: "",
  locality: "",
  countries: [],
  states: [],
  collected_from: "",
  collected_to: "",
  agent: "",
  page: 1,
};
