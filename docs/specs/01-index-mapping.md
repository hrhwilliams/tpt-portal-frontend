# Spec 01 — Index mapping v2 + reindex

Owner: indexer/ETL. Blocks specs 02–05. Nothing else can be built first.

## Why the current mapping can't answer the v1 query

Target query: _"What Sorex from Isle Royale NP were tested for hantavirus in 1994 by ELISA, and which were positive?"_

| Clause                            | Current mapping                     | Verdict                                                       |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `Sorex`                           | `genus` keyword                     | OK, but must become a keyword **array** (D23)                 |
| `Isle Royale NP`                  | only `country`, `state_prov`        | **missing** — lives in `locality_search_terms` (D24)          |
| `1994`                            | `began_date` date                   | **misses second events** — must move into nested events (D26) |
| `detected: Hantavirus`            | `attributedetail` nested type/value | OK, but needs ancestor expansion (D22)                        |
| `by ELISA`                        | no method field on the attribute    | **missing** — source has `attribute_method` (D11)             |
| ranks above family, and subfamily | only family/genus/species           | **missing** (D12)                                             |

## Mapping v2

Field names on the left are the ES field; the source column from the dump is noted where it differs.

### Identity and provenance

```json
"guid":                { "type": "keyword" },
"guid_prefix":         { "type": "keyword" },
"catalognumberint":    { "type": "long" },
"institution_acronym": { "type": "keyword" },
"collection_cde":      { "type": "keyword" },
"cataloged_item_type": { "type": "keyword" },
"use_license_url":     { "type": "keyword", "fields": { "split": SPLIT } },
"has_tissues":         { "type": "integer" }
```

`use_license_url` is per-record, not per-portal — five distinct combinations across the full slice, from CC BY-NC to CC0. **Every row carries exactly two `; `-joined URLs**: a terms-of-use URL and a Creative Commons URL. Hence the same `.split` subfield as taxonomy, so the CC term is matchable on its own. The CSV export keeps the joined string verbatim (spec 05) — it is the licence statement as issued.

### Taxonomy — multi-valued ranks handled by an analyzer (D23)

Taxonomy columns can hold several values joined by `; `. **This is also an analyzer job, not an ETL split.** A `pattern` tokenizer on `;` does it, and the same `SPLIT` subfield pattern repeats across every rank:

```json
"tokenizer": {
  "semicolon": { "type": "pattern", "pattern": "\\s*;\\s*" }
},
"analyzer": {
  "semicolon_split": { "tokenizer": "semicolon", "filter": ["trim", "lowercase"] }
}
```

```json
"kingdom":    { "type": "keyword", "fields": { "split": SPLIT } },
"phylum":     { "type": "keyword", "fields": { "split": SPLIT } },
"phylclass":  { "type": "keyword", "fields": { "split": SPLIT } },
"phylorder":  { "type": "keyword", "fields": { "split": SPLIT } },
"family":     { "type": "keyword", "fields": { "split": SPLIT } },
"subfamily":  { "type": "keyword", "fields": { "split": SPLIT } },
"genus":      { "type": "keyword", "fields": { "split": SPLIT } },
"species":    { "type": "keyword", "fields": { "split": SPLIT } },
"scientific_name":  { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
"full_taxon_name":  { "type": "text" },
"taxon_rank":       { "type": "keyword" }
```

where `SPLIT` is `{ "type": "text", "analyzer": "semicolon_split", "search_analyzer": "lowercase_keyword" }`, and `lowercase_keyword` is the `keyword` tokenizer plus a `lowercase` filter so the whole search term is matched case-insensitively as one token (OQ10).

Queries use `match` against `family.split`; the bare keyword stays exact for display, aggregations, and CSV.

Splitting only on `;` is deliberate — `species` and `subspecies` values contain spaces (`"Fundulus zebrinus"`, `"Myodes gapperi gapperi"`) and must not be tokenized on whitespace.

Two rules that remain the ETL's job:

1. **Keep the source names `phylclass` / `phylorder`.** The form maps "Class" → `phylclass` and "Order" → `phylorder` (spec 03). Renaming them in the index buys nothing and breaks traceability to the dump.
2. **`formatted_scientific_name` contains `<i>` markup** and also carries authorship (`"<i>Urocitellus parryii</i> (Richardson, 1825)"`) that `scientific_name` lacks, so it is not redundant. Store it with `"index": false` — nothing searches it — and render it through a strict allowlist permitting only `<i>`. Never `{@html}` it raw.

### Events — nested, and the only path for date/place filtering (D26)

```json
"events": {
  "type": "nested",
  "properties": {
    "specimen_event_id":     { "type": "long" },
    "specimen_event_type":   { "type": "keyword" },
    "synthesized":           { "type": "boolean" },
    "began_date":            { "type": "date", "format": DATEFMT },
    "ended_date":            { "type": "date", "format": DATEFMT },
    "verbatim_date":         { "type": "text", "index": false },
    "higher_geog":           { "type": "text" },
    "habitat":               { "type": "text" },
    "verificationstatus":    { "type": "keyword" },
    "spec_locality":         { "type": "text" },
    "locality_name":         { "type": "text" },
    "locality_search_terms": { "type": "keyword" },
    "locality_id":           { "type": "long" },
    "coordinates":           { "type": "geo_point" },
    "coordinate_error_m":    { "type": "float" },
    "collecting_method":     { "type": "keyword" },
    "collecting_source":     { "type": "keyword" }
  }
}
```

where `DATEFMT` is `"strict_date_optional_time||yyyy-MM-dd||yyyy-MM||yyyy"` (D33).

**There is no `country`, `state_prov`, or `county` here, deliberately.** `json_locality` does not carry political geography — only `higher_geog`, a `, `-joined string. Deriving country/state/county by splitting it positionally would be invention, so country and state stay **record-level** filters from the top-level columns, which do exist (D34). The cost is that a country filter is not correlated with a nested event date; that is recorded under "Known tensions" in D00 rather than papered over.

Built from `json_locality`, one nested doc per array element. Notes:

- **All events are kept, unsorted and unmerged (D27).** Duplicate georeferences of one visit stay as two events.
- Omit `coordinates` entirely when either `dec_lat` or `dec_long` is blank. A `geo_point` with a null component fails indexing; `0,0` is worse — it silently places specimens in the Gulf of Guinea.
- `verbatim_date` is free text (`"30 Aug 2002"`, `"3 JUN 1949"`). Store unindexed for display; never parse it.
- `events.locality_search_terms` is per-event and depends on OQ13. Until that is resolved, populate it from each event's own `higher_geog`, `spec_locality`, and `locality_name`, and rely on the record-level rollup below for full recall.
- **`event_count` is not trustworthy.** It disagrees with `len(json_locality)` on 3,772 of 741,801 records (0.51%), and in _both_ directions — mostly too high, but too low on 108. Build events from the array and log the discrepancy; do not use the count for validation.
- **Synthesize an event when `json_locality` is empty but top-level date or place fields are not.** `MSB:Bird:6062` has `began_date = 1985-02-07`, `event_count = 1`, and an empty `json_locality`. Since D26 routes all date filtering through nested events, that record would otherwise be unfindable by date despite having one. Build a single event from the top-level `began_date`, `ended_date`, `higher_geog`, `spec_locality`, `country`, `state_prov`, `county`, and coordinates, and mark it `synthesized: true`.

  Records with neither (`MSB:Herp:57260`) get no events at all, which is correct — D28 covers them.

### Sort-only date rollups

```json
"event_date_min": { "type": "date" },
"event_date_max": { "type": "date" }
```

Derived as the min/max across `events[].began_date` / `ended_date`. **These exist only for `sort`, and are never used as filters** — spec 02 rejects any attempt to filter on them.

They are avoidable. Elasticsearch can sort on a nested field directly:

```json
"sort": [ { "events.began_date": { "order": "asc", "mode": "min",
                                   "nested": { "path": "events" } } },
          { "guid": "asc" } ]
```

and that works with `search_after`. So these two fields are a **deliberate optimization, not a necessity**: a scalar doc-values read is cheaper than a nested sort on every page of every query, and the derivation is two `min`/`max` calls over an array the ETL has already parsed. Keeping them is a judgment call in favour of query cost; dropping them is entirely viable if you would rather have less derived state.

Do not index the original top-level `began_date` under that name. Reusing it invites exactly the bug D26 exists to prevent.

### Geography rollups — record level

```json
"country":               { "type": "keyword" },
"state_prov":            { "type": "keyword" },
"county":                { "type": "keyword" },
"locality_search_terms": { "type": "keyword" },
"higher_geog":           { "type": "text" }
```

`locality_search_terms` is the primary place field (D24). Populate from the **array** the ETL requests upstream, not by splitting the joined string — individual terms contain commas (`"United States, New Mexico, San Juan County"` is one term), so splitting on `", "` is lossy. If the array is unavailable, map it as `text` and use `match_phrase` instead, and record that as a known recall limitation.

### Ancestor expansion is an analyzer, not an ETL step (D22)

Attribute values are `:`-delimited paths, so Elasticsearch's own `path_hierarchy` tokenizer does the expansion. No new field names, no ETL derivation, no drift.

```json
"settings": {
  "analysis": {
    "analyzer": {
      "value_hierarchy": {
        "tokenizer": "value_path",
        "filter": ["trim"]
      }
    },
    "tokenizer": {
      "value_path": { "type": "path_hierarchy", "delimiter": ":" }
    }
  }
}
```

Indexing `ectoparasite: flea` emits both `ectoparasite` and `ectoparasite: flea`. Queries set `search_analyzer: keyword` so the search term is taken whole and matched against the indexed ancestor tokens — searching `ectoparasite` hits flea and louse records with no prefix query.

This is also what makes outcome pairing work: `examined for: ectoparasite` pairs with `detected: ectoparasite: flea` because both produce the `ectoparasite` token.

### Detection — flat arrays (D25)

```json
"detected":         { "type": "keyword", "fields": { "hierarchy": HIER } },
"not_detected":     { "type": "keyword", "fields": { "hierarchy": HIER } },
"examined_for":     { "type": "keyword", "fields": { "hierarchy": HIER } },
"not_examined_for": { "type": "keyword", "fields": { "hierarchy": HIER } }
```

where `HIER` is `{ "type": "text", "analyzer": "value_hierarchy", "search_analyzer": "keyword" }`.

**Build these from the `attributedetail` JSON, not from the same-named top-level columns.** The ETL already parses `attributedetail` to build the nested docs; filtering that parse for the four detection types yields the same arrays. Using the joined columns instead means parsing a second, independent source and splitting `; ` — more work, and it introduces a drift risk between the flat and nested representations that no amount of testing removes. One source, two projections.

The top-level `detected` / `examined_for` / `not_detected` / `not_examined_for` columns are then only useful as a cross-check: if they disagree with what you derived, the dump changed shape and the build should say so.

The bare keyword field stays for exact matching and display; `.hierarchy` is what searches use.

### Attributes — nested, seven real fields

```json
"attributedetail": {
  "type": "nested",
  "properties": {
    "attribute_type":       { "type": "keyword" },
    "attribute_value":      { "type": "keyword", "fields": { "hierarchy": HIER } },
    "attribute_method":     { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
    "attribute_remark":     { "type": "text" },
    "attribute_determiner": { "type": "keyword" },
    "attribute_date":       { "type": "date", "format": DATEFMT },
    "attribute_units":      { "type": "keyword" }
  }
}
```

- **Drop rows whose `attribute_type` is marked `public: 0` in `ctattribute_type` (D35).** Currently `NAGPRA category`, `restricted data`, and `value`. None occur in `msb.csv` — which is the point: this is enforced, not observed, exactly like the D29 encumbrance assertion. Fail the build on an `attribute_type` the code table does not document at all. See spec 09.
- `attribute_value` stays exact for display and CSV; `attribute_value.hierarchy` is what queries match against.
- **`attribute_value.hierarchy` is only meaningful for the four detection types.** The tokenizer runs on all 84 attribute types, and prose values carry incidental colons — `reproductive data` reaches depth 12 (`"testes position: abdominal | testes length: 1 mm | …"`), producing ancestor tokens like `testes position` on ~94,000 rows. Harmless for search, since only detection values are ever queried, but it means this subfield must **never** be used as an aggregation source. Spec 03 aggregates the flat detection fields instead.
- `attribute_date` stays a real `date` with the `DATEFMT` list (D33) — 2,308,842 values are `yyyy-MM-dd`, 7,099 are `yyyy-MM`, 4,659 are `yyyy`, and none are malformed. It is **not** exposed as a filter (D9): it is often the load date, and one record's own remark states _"Attribute date reflects loaded date only."_ Index it for display and provenance in the export.
- `attribute_method` gets both `text` (for the free-text "method contains" input) and `.keyword` (so `/schema` can aggregate the top values for guidance, even though a dropdown is not viable).
- `attribute_method` also carries non-method provenance notes (`"Migrated from SNV results."`). Do not present it as authoritative method metadata.

### Agents — nested, plus a flat fast path

```json
"agents": {
  "type": "nested",
  "properties": {
    "agent_id":    { "type": "keyword" },
    "agent_name":  { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
    "agent_role":  { "type": "keyword" },
    "agent_order": { "type": "integer" }
  }
},
"collector_ids":   { "type": "keyword" },
"collector_names": { "type": "text" }
```

From `collector_agents`. **Role filtering is required** — the array mixes `collector` (270) and `preparator` (63), and one sampled record's array holds only a preparator. `collector_ids` / `collector_names` are the role-filtered flat rollup for the common case; the nested form exists for role-specific queries.

Match on `agent_id` (a stable Arctos agent URL), not the name. That is what makes "Robert L. Rausch" robust against spelling variants. Note collectors are frequently projects or institutions, not people: `"Chile Hantavirus Project"`, `"Kobuk River Small Mammal Crew"`.

### Relations — mapped in v1, queried in v2 (D7 + D31)

```json
"relations": {
  "type": "nested",
  "properties": {
    "relationship":            { "type": "keyword" },
    "related_guid":            { "type": "keyword" },
    "related_identifier":      { "type": "keyword" },
    "related_identifier_type": { "type": "keyword" },
    "related_family":          { "type": "keyword" },
    "related_identification":  { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
    "related_geography":       { "type": "text" },
    "unresolved_reason":       { "type": "keyword" }
  }
}
```

Built from `related_record_cache` (JSON — **do not parse the `relatedcatalogeditems` display string**; the cache is the same data already structured, aligned 1:1 across all 170,984 relation rows, with zero parse errors).

**This is a copy, not a derivation (D31).** The full slice overturned both halves of the withdrawn D30:

- `host of parasite` is stored natively — 54,059 rows, on the host records, pointing back at the parasite. No inverse synthesis, and no `inferred` flag, because nothing is inferred.
- `MSB:Host` records are complete specimens (100% `scientific_name`, 99.9% `collector_agents`, 97.6% `genus`), not stubs. Only 3.4% carry the `same individual as` edge the traversal assumed. No `resolved_via`, because there is one path.

The related taxonomy collapses to `related_family` plus the loose `identification` string, both straight from the cache. Filtering related records at ranks _below_ family needs the two-pass join sketched in spec 06 — deferred under D32, since both flagship queries filter at family (`Taeniidae`).

The one real ETL step: **`record` arrives in three forms** and must be normalised to a bare GUID.

| Form       |    Rows | Example                                               | `related_guid`                     |
| ---------- | ------: | ----------------------------------------------------- | ---------------------------------- |
| Full URL   | 142,242 | `https://arctos.database.museum/guid/MSB:Mamm:293371` | strip prefix                       |
| Bare GUID  |   5,886 | `MSB:Mamm:293371`                                     | as-is                              |
| Not a GUID |  22,856 | `A4HEG`, `NK 200451`, `AMNH M 263798`, `318688`       | null; keep in `related_identifier` |

191 URLs are `http://`, not `https://`. Match on the path segment, not a fixed prefix string.

The third form is 13.4% of relations — better than the 27% the small sample suggested, still large enough that the rate must be shown in the UI rather than silently answering for 87% of the graph. `unresolved_reason` takes `barcode`, `nk`, `foreign_identifier`, `numeric`, `cache_empty`.

Mapping these now is deliberate: v2 adds query paths, not a reindex of >10M documents.

### Parts, kept as-is

`partdetail` keeps its existing nested shape. Observed `part_attributes.attribute_type` values are `preservation`, `storage temperature`, `part modifier`. Not queried in v1.

### Field name resolved

`relatedcatalogeditems` is the real column name in the dump; `relatedcatalogdata` does not exist. OQ5 closed. The v2 `relations` field above replaces it for querying — keep the raw string only if you want it for display.

## Sort tiebreaker

`search_after` requires a fully deterministic sort. `guid` is a `keyword` and unique per specimen, so it is the tiebreaker for every sort order. No mapping change needed; noted here because spec 05 depends on it.

## Reindex procedure

The index must **never** be written to under the name the API reads.

1. API always reads through an alias: `specimens`.
2. ETL builds a new concrete index per run: `specimens-v2-YYYYMMDD`.
3. Load the snapshot into the new index with `refresh_interval: -1` and `number_of_replicas: 0`, then restore both.
4. Verify: doc count within tolerance of the snapshot row count, and a fixed set of smoke queries returns non-zero.
5. Atomically move the alias (single `_aliases` call with `remove` + `add`).
6. Keep the previous index for one cycle for instant rollback, then delete.

Rust reads `ES_INDEX_ALIAS` from config and never hardcodes a concrete index name.

Two additions given the derived fields in this mapping:

- Step 4's smoke queries must include one per derived field — ancestor expansion, taxonomy splitting, inverse edges, `MSB:Host` resolution. A derived field that silently stops populating produces fewer results, never an error.
- Step 4 also asserts `encumbrances` is empty across the whole snapshot (D29). If that ever fails, the build stops rather than publishing restricted localities.
- Step 4 asserts no indexed `attributedetail.attribute_type` is marked `public: 0` in the code-table snapshot (D35), and that every observed type is documented. Both are counting queries, and both fail the build rather than warning.

## Deliverable

- `mapping.v2.json` — the full mapping above
- ETL single pass: `relations` copied from `related_record_cache` with `record` normalised to a GUID (D31). No inverse synthesis, no stub traversal, no classification join
- Alias-swap script implementing the six steps
- Smoke-query file used by step 4
- `tools/profile_dump.py`, `tools/profile_msb.py`, `tools/profile_msb2.py` — run against each snapshot. The last two are what produced spec 08 and stream in chunks, so they handle a 7 GB dump

## ETL transformations, collected

Everything the ETL derives rather than copies. Each one is a place where a silent regression returns fewer results instead of failing:

| Output                              | From                               | Rule                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events[]`                          | `json_locality`                    | one nested doc per element; omit `coordinates` if either lat/long blank; keep duplicates (D27); synthesize one from top-level fields when the array is empty but a date or place exists |
| `event_date_min` / `_max`           | `events[].began_date`/`ended_date` | min/max; sort-only; optional (see above)                                                                                                                                                |
| `detected` and siblings             | `attributedetail` JSON             | filter to the four detection types, after dropping `public: 0` types (D35). **Not** from the joined top-level columns                                                                   |
| `collector_ids` / `collector_names` | `collector_agents`                 | filter `agent_role = collector`                                                                                                                                                         |
| `relations[]`                       | `related_record_cache`             | copy; normalise `record` to a bare GUID; flag the 13.4% that are not GUIDs (D31)                                                                                                        |
| `locality_search_terms`             | upstream **array**                 | do not split the joined string (D24, OQ12)                                                                                                                                              |

Removed by the full-slice profile, and worth recording as removed so they are not reintroduced:

| Was                                        | Why it is gone                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Inverse relation edges                     | `host of parasite` is in the source (D31)                                |
| `MSB:Host` stub traversal                  | `MSB:Host` records are complete (D31)                                    |
| Two-pass `guid → classification` join      | `related_family` is in the cache and both queries filter at family (D32) |
| Partial-date coercion                      | a `format` list parses them (D33)                                        |
| `events.country` / `state_prov` / `county` | not in `json_locality`; splitting `higher_geog` would be invention (D34) |

Handled by analyzers, **not** the ETL — no derived state, nothing to drift:

| Concern                          | Mechanism                                 |
| -------------------------------- | ----------------------------------------- |
| `:` value hierarchy (D22)        | `path_hierarchy` tokenizer → `.hierarchy` |
| `; ` multi-valued taxonomy (D23) | `pattern` tokenizer → `.split`            |
| case-insensitive matching (OQ10) | `lowercase` filter in the search analyzer |

## Verified against `test.csv` — closed

- Higher-rank taxonomy is present, and richer than assumed: 14 rank columns including `subfamily`, which the flagship query needs.
- `attribute_method` exists as a first-class field. `attribute_remark` is separate and is not the method.
- `spec_locality` is **not** the right source for "Isle Royale NP" — `locality_search_terms` is (D24).
- `relatedcatalogeditems` is the real column name; `relatedcatalogdata` does not exist.

## Verified against the full MSB slice — closed

Profiled 741,801 rows; see [08-full-dump-validation.md](08-full-dump-validation.md).

- [x] `attribute_date` — not clean ISO, but no garbage either. `date` + `format` list (D33). Same for `began_date`/`ended_date`.
- [x] The colon convention holds where it matters: detection values are 16 distinct values at max depth 2. Other attribute types reach depth 12, which is why `.hierarchy` is search-only and never an aggregation source.
- [x] `event_count` disagrees on 0.51% of records, in both directions. Unusable for validation, as already assumed.
- [x] Only 7 of the 24 columns spec 07 flagged are empty corpus-wide. OQ15 closed for this slice.

## Still to verify against the production dump

- [ ] Whether the production dump is scoped such that cross-institution relation targets resolve. `msb.csv` was built by following relations, so it resolves them by construction; a strictly MSB-scoped dump would not. This is fixed by widening the dump, not by code (spec 06).
- [ ] The 3,426-row gap between `parasite of` and `host of parasite`. Expected to be edges leaving the slice — measure before assuming.
- [ ] Whether non-MSB institutions populate any of the seven corpus-empty columns.
