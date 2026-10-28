# `GET /api/summary`

The portal's results now open on a Summary tab: statistics over the whole result set,
with the record tables behind it as previews. The previews page through
`/api/search` and `/api/relations` as before. The summary needs one new endpoint,
because it describes every matched record, not a page of them, and a page of records
cannot say how many distinct taxa or collectors the whole set holds.

The portal is already built against the response below and shows the endpoint's
error message on the Summary tab until it exists.

## Request

Identical query parameters to `/api/search` — `taxon`, `attr`, `attr_op`, `method`,
`prefix`, `locality`, `country`, `state`, `from`, `to`, `collector`. No `page`, no
`tab`: one response covers both tables.

## Response

```json
{
  "records": {
    "matched": 227,
    "distinct": { "taxa": 4, "localities": 61, "collectors": 38 },
    "years": { "min": 1958, "max": 2019 },
    "facets": {
      "taxa": [{ "value": "Sorex cinereus", "count": 140 }, { "value": "Sorex monticolus", "count": 52 }],
      "countries": [{ "value": "United States", "count": 227 }],
      "states": [{ "value": "New Mexico", "count": 180 }, { "value": "Colorado", "count": 47 }],
      "collections": [{ "value": "MSB:Mamm", "count": 186 }, { "value": "DMNS:Mamm", "count": 41 }]
    }
  },
  "related": [
    {
      "relation": "host of parasite",
      "pairings": 229,
      "matched": 188,
      "distinct": { "taxa": 5, "localities": 96, "collectors": 24 },
      "years": { "min": 1945, "max": 2024 },
      "facets": { "...": "same four lists as above" }
    }
  ],
  "description": "Shrews of the genus Sorex recorded as hosts of cestodes."
}
```

### `records`

Statistics over the set `/api/search` matches for these parameters. `matched` is the
same number `/api/search` reports in `summary.matched`.

- **`distinct.taxa`** — distinct lowest identified taxon (`scientific_name`).
- **`distinct.localities`** — distinct localities. Use whatever identifies a locality in
  the index (a locality id if there is one, else the specific locality string).
- **`distinct.collectors`** — distinct collector names, the same field `collector=`
  filters on.
- **`years`** — min and max collecting year across the set, `null` when no record in the
  set carries a date. Records with no date do not pull `min` down.
- **`facets.*`** — the top values by record count, descending, at most 10 each.
  `taxa` by `scientific_name`, `countries` and `states` by the same fields the filters use,
  `collections` by `guid_prefix`. A record holding several values (a locality in two
  states) counts once under each. An empty list is fine; the portal shows "None recorded".
- **`facets.detections`, `facets.attributes`, `facets.parts`** — optional; the portal
  shows each column once it is present. Items are `{ "type": "...", "value": "...", "count": n }`,
  the top `(type, value)` pairs by record count, same limit as the lists above.
  `detections` covers the attribute types `detected`, `not detected`, `examined for` and
  `not examined for`; `attributes` every other categorical attribute type (skip free-text
  and numeric ones); `parts` the part fields `part=` filters on. `type` and `value` must
  be exactly what `attr=type|value` / `part=field|value` match, since clicking one adds
  that filter.

Elasticsearch gives all of this from one request with `size: 0`: `cardinality` for the
distinct counts, `min`/`max` on the year, `terms` for the facets.

### `related`

**One entry per relationship the query names**, not one entry bundling all of them. A
search for `host of parasite; ate` produces two entries, each describing only the records
reached by that one relationship. An empty list when the query names no relationship.

Each entry is a `records` block plus two fields:

- **`relation`** — the relationship term itself, exactly as it arrived in the `taxon`
  parameter, e.g. `host of parasite`. The portal uses it verbatim as the section heading,
  so send the term, not a rephrasing of it.
- **`pairings`** — distinct (matched record, related record) links by **this**
  relationship: the matching relations across all matched records, counted before
  collapsing to distinct related GUIDs. The 229 in the relations doc's worked example,
  where `records.matched` is 227 and that entry's own `matched` is 188.
  **The portal does not display this.** The gap between it and `matched` comes from one
  animal catalogued twice, typically as both a `:Mamm` and a `:Host` record, so it
  measures curation rather than anything a researcher can act on. Keep sending it — it is
  the raw material for the deduplication described under Open questions — but it needs no
  work beyond what falls out of the aggregation.

List the entries in the order the relationships appear in the query.

These counts are per relationship, so they will not sum to what `/api/relations` reports.
That endpoint still bundles every relationship into one table and stays exactly as it is;
a record reached by two relationships is one row there, but appears under both entries
here. That is the intended difference, not a discrepancy to reconcile.

Phase 1 of `/api/relations` already walks each matched record's relations and tests the
predicate. Splitting means keeping the GUIDs in a map keyed by the relationship term that
matched, rather than in one flat set, then running phase 2 and the aggregations once per
key. A relation satisfying two of the query's terms counts under each.

### `description`

A one-sentence plain-English restatement of the query, for a researcher to confirm
they searched what they meant to. `null` if unavailable. This is a good fit for a small
LLM call with the parsed query as input; the portal shows whatever string comes back,
verbatim, in italics. It must never block the numbers: if the model is slow or down,
answer with `"description": null` rather than failing or delaying the response.

A cheaper first version is a template: "{taxa}{, with relationship}{ in countries}{,
collected from–to}". Either satisfies the portal.

## Rules

- **The same 400s as `/api/search`** for a malformed `taxon`. Any other failure should
  return JSON with a `message`; the portal shows it on the Summary tab and the previews
  keep working.
- **Cardinality is approximate** in Elasticsearch above a few thousand values. That is
  acceptable; the numbers are for orientation, not citation.
- **The `/api/relations` size guard applies.** A search past the `terms` limit fails the
  same way there; `related` can then come back empty with `records` still filled, rather
  than failing the whole summary.

## Numbers to check against

```
taxon=genus|Sorex|host of parasite|class|Cestoda
```

One relationship, so one entry in `related`. From the relations doc: `records.matched`
227, that entry's `matched` 188, its `pairings` 229.

## Open question: collapsing one animal catalogued twice

Not part of this endpoint, and not decided — raised here because the `pairings` gap is
where it shows up.

A single shrew is often catalogued twice, as a `:Mamm` record and a `:Host` record, and
both point at the same parasite lot. Every count in this response therefore
double-counts that animal, and so does the record table. Arctos records the link as the
`same individual as` relationship (`same lot as` and `self` are adjacent cases worth
looking at too), so the duplicates are identifiable rather than a matter of guessing
from field values.

The questions to answer before building it:

- How often is `same individual as` actually recorded? If curators record it patchily,
  collapsing on it removes some duplicates and silently keeps others, which is worse
  than not collapsing at all. This is worth measuring against the snapshot first.
- Which record survives a collapse, and is that choice stable across pages?
- Does it belong as a search filter, affecting every count and both tables, or only as
  a second number on the summary? Making it a filter means `/api/search`,
  `/api/relations`, the exports and this endpoint all have to agree.

A cheap first step that answers none of these but is still useful: report how many
matched records carry a `same individual as` link to another matched record, so the
size of the problem is visible before anyone builds the fix.

## Migration

The portal reads the current single-object `related` as one entry labelled with the
query's relationships, so it keeps working until this lands. That adapter is marked in
`src/routes/search/SearchSummary.svelte` and comes out once the list ships.
