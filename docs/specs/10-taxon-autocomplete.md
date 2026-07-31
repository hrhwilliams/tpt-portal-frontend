# Spec 10 — Taxon autocomplete

D42 reverses D13. A separate taxon-name index ships in v1.

Small spec, one index and one endpoint. Depends on spec 01 only for the snapshot it reads.

## Why this is worth a v1 scope increase

The taxon input is the form's first field and its least forgiving. `term` matching is exact and case-sensitive at the bare keyword; a typo, a synonym, or the wrong rank returns zero results with no explanation. The data makes this worse in three specific ways:

- **`taxon_rank` is empty on 23.5% of records**, so the rank a user picks is not always the rank the record was identified to.
- **Ranks are multi-valued** — `subfamily = "Arvicolinae; Arvicolinae"`, `suborder = "Echinostomata; Digenea"` (D23).
- **The interview itself got a rank wrong.** "Arvicolidae" is `subfamily = Arvicolinae` under `family = Cricetidae`. A domain expert asked for a family that does not exist in this taxonomy source. Autocomplete would have shown that immediately.

That last point is the argument. If the person who commissioned the portal picked the wrong rank in their own flagship query, a bare text input will fail its users routinely and silently.

## Index

Separate index, `taxa`, aliased like the main one. Small — hundreds of thousands of rows at most, against >10M specimens.

```json
{
  "rank":         { "type": "keyword" },
  "name":         { "type": "keyword",
                    "fields": {
                      "prefix": { "type": "text", "analyzer": "name_prefix",
                                  "search_analyzer": "lowercase_keyword" },
                      "lower":  { "type": "keyword", "normalizer": "lowercase" }
                    } },
  "record_count": { "type": "long" },
  "parent_rank":  { "type": "keyword" },
  "parent_name":  { "type": "keyword" }
}
```

```json
"analyzer": {
  "name_prefix": { "tokenizer": "keyword",
                   "filter": ["lowercase", "edge_ngram_2_20"] }
},
"filter": {
  "edge_ngram_2_20": { "type": "edge_ngram", "min_gram": 2, "max_gram": 20 }
}
```

`keyword` tokenizer, not `standard` — `"Myodes gapperi gapperi"` must prefix-match as one string, so `myodes g` matches and `gapperi` alone does not. Edge n-grams at index time keep the query a plain `match`; a `prefix` query over a large field would be the slower path.

`parent_rank` / `parent_name` disambiguate homonyms and let the UI show `Arvicolinae (subfamily, in Cricetidae)`, which is what would have caught the interview's mistake.

## ETL

One extra pass over the snapshot the ETL already reads:

1. For each of the seven ranks in D12, take the column value and split on `;` — the same split D23 handles at search time, done concretely here because these become documents.
2. Trim, drop empties, count occurrences.
3. Record the immediate parent rank's value from the same row.
4. Write one document per distinct `(rank, name)`.

`record_count` is the number of specimens carrying that name at that rank. Populating it is what lets the UI sort by usefulness rather than alphabetically, and lets it show `Sorex (genus) — 12,481 records`.

Homonyms across ranks are separate documents. `(family, Cricetidae)` and `(subfamily, Arvicolinae)` are unrelated rows.

## Endpoint

`GET /api/taxa?rank=genus&q=sor&limit=10`

```json
{
  "matches": [
    { "rank": "genus", "name": "Sorex", "record_count": 12481,
      "parent_rank": "family", "parent_name": "Soricidae" },
    { "rank": "genus", "name": "Sorella", "record_count": 3,
      "parent_rank": "family", "parent_name": "Formicidae" }
  ]
}
```

- `rank` is optional. Omitted, it searches every rank and returns the rank in each match — which is how a user who typed `Arvicolidae` gets shown `Arvicolinae (subfamily)`.
- `q` requires 2 characters. Below that, return empty rather than the top of the alphabet.
- Sort by `record_count` descending, then name ascending. Common taxa first is right for a search form; alphabetical is not.
- `limit` caps at 20.

Query:

```json
{ "size": 10,
  "query": { "bool": { "filter": [
    { "term":  { "rank": "genus" } },
    { "match": { "name.prefix": "sor" } }
  ] } },
  "sort": [ { "record_count": "desc" }, { "name": "asc" } ] }
```

## Guardrails

D38 makes this a public unauthenticated endpoint like the others, and it is the one users will hit hardest — one request per keystroke.

| Guard | Value |
|---|---|
| Debounce | 200 ms client-side, and requests are cancelled on new input |
| Min query length | 2 characters, enforced server-side too |
| Max `limit` | 20 |
| Per-IP rate limit | 120 req/min — higher than search, because typing is bursty |
| Cache | `Cache-Control: public, max-age=3600`; the data only changes on snapshot swap |

The response is small and highly cacheable, so a CDN in front of this endpoint removes most of the load. Worth doing before launch rather than after.

## Frontend

A combobox, not a datalist. `<datalist>` cannot show the rank, parent, or record count, and those are the whole point.

- Typing filters; arrow keys navigate; Enter selects.
- **The field remains free text.** Selecting a suggestion fills it, but a user may submit anything — the index is a snapshot and a valid name absent from it must still be searchable. This is D37's rule applied to the UI: suggest, never constrain.
- Each option shows `name`, the rank if searching across ranks, the parent, and the record count.
- A zero-match state says "no taxon matching that in this snapshot" rather than showing nothing, so the user can tell the difference between "no suggestions" and "the box is broken".

## Tests

- `q` shorter than 2 characters returns empty and does not hit Elasticsearch.
- `myodes g` matches `Myodes gapperi`; `gapperi` alone does not match it.
- Case-insensitive: `sorex`, `Sorex`, `SOREX` return the same set.
- A name appearing at two ranks returns two documents with different `parent_name`.
- A submitted taxon absent from the index still runs a search rather than being rejected.
- `Arvicolidae` with no rank filter returns nothing, and the UI's empty state is what tells the user so — the case that motivated this spec.
