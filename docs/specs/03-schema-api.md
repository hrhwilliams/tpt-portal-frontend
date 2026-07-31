# Spec 03 — Schema API

`GET /api/schema` on the Rust service. Makes the frontend form data-driven (D16). Depends on spec 01.

## Response

```json
{
  "snapshot_date": "2026-07-01",
  "ranks": [
    { "id": "phylum",    "label": "Phylum",    "field": "phylum" },
    { "id": "class",     "label": "Class",     "field": "phylclass" },
    { "id": "order",     "label": "Order",     "field": "phylorder" },
    { "id": "family",    "label": "Family",    "field": "family" },
    { "id": "subfamily", "label": "Subfamily", "field": "subfamily" },
    { "id": "genus",     "label": "Genus",     "field": "genus" },
    { "id": "species",   "label": "Species",   "field": "species" }
  ],
  "outcomes": [
    { "id": "detected",           "label": "Detected" },
    { "id": "not_detected",       "label": "Not detected" },
    { "id": "examined_no_result", "label": "Examined, no result recorded",
      "allows_method": false },
    { "id": "examined",           "label": "Any record of examination" }
  ],
  "analysis_values": ["ectoparasite", "ectoparasite: flea", "endoparasite",
                      "parasite", "virus: Orthohantavirus", "..."],
  "countries":  ["United States", "..."],
  "sorts": [
    { "id": "guid_asc",  "label": "Catalog number" },
    { "id": "date_desc", "label": "Newest collection date" },
    { "id": "date_asc",  "label": "Oldest collection date" }
  ],
  "limits": { "max_per_page": 200, "max_result_window": 10000, "max_export_rows": 100000 }
}
```

`ranks` only lists ranks that actually exist in the current index — if the snapshot has no `phylum` values, it is omitted and the form loses that option automatically. Determined once at startup via a `_field_caps` call plus a cheap non-zero-value check. `field` is included so the mapping from label to index field lives in one place; the client sends `id`, and spec 02 validates it against this list.

`analysis_values` comes from the **`ctexamined_detected` code table**, not from an aggregation (D36). All four detection types share that one table, it has 32 values, and each carries a description worth putting in the option's `title`:

```json
"analysis_values": [
  { "value": "ectoparasite", "count": 78114,
    "description": "Use a more specific term if known. Unspecified parasites that live on or embedded in the body surface of the host…" },
  { "value": "ectoparasite: flea", "count": 518, "description": "Fleas are ectoparasitic insects in the order Siphonaptera…" },
  { "value": "endoparasite: cestode", "count": 0, "description": "…" }
]
```

An aggregation returns only values that are present, so a controlled value with no records silently disappears from the dropdown and the form's options change between snapshots. The code table is the complete list. **The aggregation is still run — but only to attach `count`**, so the form can show a zero-record value as disabled rather than omit it. Aggregate the bare keyword field, never `.hierarchy`, which would return synthetic ancestor tokens alongside real values.

Values sort so parents precede children (`ectoparasite` before `ectoparasite: flea`), which the form uses to indent the hierarchy. Maximum depth is 2 and that is guaranteed by the code table, not merely observed (spec 09).

`countries` stays an aggregation on `country` — there is no code table for it.

**There is no `methods` list.** `attribute_method` is prose, not vocabulary — `comb`, `combed`, `comb with chloroform`, and `comb w/chloroform` all occur in a 199-row sample, alongside a 140-character serology description. A dropdown would imply a precision the data does not have. The form takes free text (D11). If guidance is wanted, `/schema` may expose the top ~20 `attribute_method.keyword` values as *examples* — labelled as examples, never as the complete set.

`limits` is echoed so the frontend enforces the same bounds the backend does, without duplicating the numbers in TypeScript.

## Caching

Vocabulary aggregations against >10M docs are not free and the data only changes on snapshot swap (D2).

- Code tables are read from the snapshot on disk written by `tools/fetch_code_tables.py`, **not** fetched from Arctos at runtime. The authority API is IP-bound and a third-party dependency; a public portal must not fail its form render because someone else's service is down.
- Compute at startup, store in `Arc<RwLock<Schema>>`.
- Refresh on a 15-minute interval, and force a refresh when the alias target changes.
- Serve with `Cache-Control: public, max-age=900`.
- If the refresh fails, keep serving the stale copy and log — a schema fetch failure must not take the form down.

`allows_method: false` is why the outcome list carries structure rather than being strings — the form disables the method input for that option, and spec 02 rejects the combination server-side. Neither hardcodes the rule.

## Why `snapshot_date` is here

D2 means data is stale by design. The UI displays it ("Data current as of …") so users don't assume live records.

**Source: an ETL-written metadata document (D41).** One doc per index:

```json
{ "doc_type": "snapshot_metadata",
  "snapshot_date": "2026-07-01",
  "extracted_at": "2026-07-01T04:12:00Z",
  "source_file": "arctos-export-20260701.csv",
  "row_count": 10482913,
  "indexed_count": 10482913,
  "code_tables_fetched": "2026-07-01",
  "assertions": { "encumbrances_empty": true, "nonpublic_attributes_dropped": 0,
                  "undocumented_attribute_types": [] } }
```

The alias target's creation date was the alternative and is rejected: it records when the index was *built*, not when the data was *extracted*, and those differ by however long the ETL queue was. `extracted_at` depends on the dump carrying a timestamp — request 4 in spec 11. Until that lands, it equals the ETL run time and the UI shows the date only, not the time.

Carrying the D29 and D35 assertion results here means `/api/schema` can surface "this snapshot was verified" rather than the guarantee living only in a build log nobody reads.

## Tests

- Startup with an empty index yields a schema with empty vocab lists and does not panic.
- Refresh failure preserves the previous schema.
- `ranks` omits ranks absent from the index.
