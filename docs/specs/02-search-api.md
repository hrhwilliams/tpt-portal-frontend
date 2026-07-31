# Spec 02 — Search API

`POST /api/search` on the Rust service. Depends on spec 01.

## Contract

Request:

```json
{
  "taxon":    { "rank": "genus", "value": "Sorex" },
  "locality": "Isle Royale National Park",
  "country":  "United States",
  "state_prov": "Michigan",
  "collected_from": "1994-01-01",
  "collected_to":   "1994-12-31",
  "collector_id": "https://arctos.database.museum/agent/1010760",
  "analysis": {
    "value":   "virus: Orthohantavirus",
    "outcome": "detected",
    "method":  "immunoblot"
  },
  "page": 1,
  "per_page": 50,
  "sort": "guid_asc"
}
```

`analysis.outcome` is one of `detected` | `not_detected` | `examined_no_result` | `examined` (D40). There is deliberately no option that infers a negative from absence.

| Outcome | Means | Query shape |
|---|---|---|
| `detected` | positive result recorded | `term` on `detected.hierarchy` |
| `not_detected` | negative result recorded | `term` on `not_detected.hierarchy` |
| `examined_no_result` | examined, outcome never recorded | `examined_for.hierarchy` matches **and neither** outcome field does |
| `examined` | any record of examination — the denominator | `should` across all three |

`examined_no_result` is the one that needs care. It is the only outcome expressed partly as a *negative* clause, and the negation must run against `.hierarchy`, not the bare field:

```json
{ "bool": {
    "filter":   [ { "term": { "examined_for.hierarchy": "ectoparasite" } } ],
    "must_not": [ { "term": { "detected.hierarchy":     "ectoparasite" } },
                  { "term": { "not_detected.hierarchy": "ectoparasite" } } ] } }
```

Against the bare keyword this returns wrong answers on real records. `MSB:Mamm:348964` has `examined for: ectoparasite` with outcomes recorded at the finer values `ectoparasite: flea` and `ectoparasite: louse`. Bare-field equality sees no matching outcome and reports "examined, no result" — the opposite of the truth, which is two positives. `.hierarchy` makes the child values produce the `ectoparasite` token, so the `must_not` correctly excludes it. **This is the single subtlest query in the service and needs its own fixture test.**

Every field is optional except that **at least one** of `taxon`, `locality`, `attribute`, or a date bound must be present — an unconstrained match-all against >10M docs is rejected with `400 empty_query`.

Response:

```json
{
  "total": 143,
  "total_is_lower_bound": false,
  "page": 1,
  "per_page": 50,
  "hits": [ { "guid": "...", "scientific_name": "...", "...": "..." } ],
  "snapshot_date": "2026-07-01",
  "took_ms": 34
}
```

`total_is_lower_bound: true` means the count hit the `track_total_hits` ceiling (D19) and the UI must render "10,000+".

## Query translation

Every clause goes in `bool.filter` — no scoring, no `must`. Filters are cacheable and this search has no meaningful relevance ranking.

The request above, with a method present so the nested attribute path is taken:

```json
{
  "track_total_hits": 10000,
  "from": 0,
  "size": 50,
  "sort": [ { "guid": "asc" } ],
  "_source": ["guid","guid_prefix","scientific_name","family","genus","species",
              "events","event_date_min","event_date_max","use_license_url"],
  "query": {
    "bool": {
      "filter": [
        { "match": { "genus.split": "Sorex" } },
        { "term": { "collector_ids": "https://arctos.database.museum/agent/1010760" } },
        { "term": { "country": "United States" } },
        { "term": { "state_prov": "Michigan" } },

        { "nested": {
            "path": "events",
            "query": { "bool": { "filter": [
              { "term":  { "events.locality_search_terms": "Isle Royale National Park" } },
              { "range": { "events.began_date": { "gte": "1994-01-01", "lte": "1994-12-31" } } }
            ] } }
        } },

        { "nested": {
            "path": "attributedetail",
            "query": { "bool": { "filter": [
              { "term": { "attributedetail.attribute_type": "detected" } },
              { "term": { "attributedetail.attribute_value.hierarchy": "virus: Orthohantavirus" } },
              { "match_phrase": { "attributedetail.attribute_method": "immunoblot" } }
            ] } }
        } }
      ]
    }
  }
}
```

Without a method, the analysis clause collapses to the flat fast path (D25) — no nested query at all:

```json
{ "term": { "detected.hierarchy": "virus: Orthohantavirus" } }
```

and for `outcome: "examined"`, the denominator query:

```json
{ "bool": { "should": [
    { "term": { "examined_for.hierarchy": "virus: Orthohantavirus" } },
    { "term": { "detected.hierarchy":     "virus: Orthohantavirus" } },
    { "term": { "not_detected.hierarchy": "virus: Orthohantavirus" } }
  ], "minimum_should_match": 1 } }
```

`detected` and `not_detected` are included because a specimen can carry an outcome with no `examined for` row at all — 2 of 14 sampled `detected` rows do. Querying `examined_for` alone under-counts the denominator.

### Rules that are easy to get wrong

1. **Each nested clause is one clause.** Conditions that must hold *together* live inside a single `nested` query (D18). Splitting the attribute conditions into sibling `nested` clauses is a different, wrong query — it matches a specimen where `detected: Orthohantavirus` came from one row and `immunoblot` from an unrelated row. Same for events: date and place go in one clause so they describe the same visit.
2. **Field paths inside `nested` are fully qualified** — `events.began_date`, not `began_date`. Unqualified paths silently match nothing.
3. **Always query the analyzed subfield, never the bare keyword.** `.hierarchy` for attribute and detection values (D22) so `ectoparasite` finds `ectoparasite: flea`; `.split` for taxonomy (D23) so `subfamily: Arvicolinae` finds `"Arvicolinae; Arvicolinae"`. The bare keyword exists for display, aggregations, and CSV. Querying it misses matches silently, with a plausible-looking result count — this is the single most likely defect in the service.
4. **Never filter on `event_date_min` / `event_date_max`.** They exist only for sorting (D26); filtering on them reintroduces the multi-event bug they were derived around. Validation rejects any request that tries.
5. `taxon.rank` is validated against an allowlist and mapped to a field name — `class` → `phylclass`, `order` → `phylorder` (D12). Never interpolate a client-supplied string into a field position.
6. `_source` is explicitly listed. Fetching whole documents at this scale is the easiest performance mistake here. `events` is included whole because the results table shows locality and date.
7. **`country` and `state_prov` are record-level, not event-level (D34).** `json_locality` carries no political geography, so there is no `events.country` to filter. A country filter therefore is *not* correlated with the event date — a specimen collected in two countries matches a (country A + date in country B) search. Rare, and the honest alternative — splitting `higher_geog` positionally — invents data. Note it in the UI; do not fix it in the ETL.
8. **Date filters must tolerate partial dates (D33).** `began_date` accepts `yyyy`, `yyyy-MM`, and datetimes. Elasticsearch parses `1950` as `1950-01-01`, so a `1950-06-01 … 1950-12-31` range misses year-only records. ~650 collecting dates are year-or-month only. The form says so; the API does nothing special.
9. **`locality_search_terms` is a `term` on a keyword array** — exact match against a place name the user picked or typed in full. If OQ12 lands as joined text instead, this becomes `match_phrase` and recall changes. One of the few places a mapping decision leaks into query code.

### Which analysis path runs

| Request | Path | Cost |
|---|---|---|
| `analysis` absent | no clause | — |
| `value` + `outcome`, no `method` | flat `term` on the outcome array | cheap |
| `outcome: "examined_no_result"`, no `method` | flat `bool` with `must_not` | cheap |
| `method` present | `nested` on `attributedetail` | correlated, expensive |
| `outcome: "examined"` + `method` | `nested` with `should` across the three types | correlated, expensive |
| `outcome: "examined_no_result"` + `method` | **rejected**, `400 invalid_outcome_method` | — |

The last row is a deliberate refusal. "Examined by this method, with no result recorded" cannot be answered honestly: the method lives on the attribute row, and the state being searched for is defined by the *absence* of the rows that would carry a method. Returning something plausible here would be worse than returning an error, so the form disables the method input when that outcome is selected.

The backend chooses; the API does not expose the choice. Both paths must return identical results when no method is given, and that equivalence is a **test**.

Spec 01 builds the flat arrays from the same `attributedetail` parse that produces the nested docs precisely so the two cannot disagree — but the test stays, because a future change to either projection would otherwise break the fast path silently.

## Guardrails (mandatory — D15 + D38, public, unauthenticated, browser-facing)

D38 settled the topology: Netlify serves static assets, and **the browser calls this API directly**. There is no SvelteKit server in front of it. Every guard below is the only thing between the open internet and a >10M-document cluster — none of it is defence in depth.

CORS is therefore part of the contract, not a deployment detail:

| Setting | Value |
|---|---|
| `Access-Control-Allow-Origin` | An **explicit allowlist** of the Netlify production and preview domains. Never `*` |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type` |
| `Access-Control-Max-Age` | `86400`, so preflights don't double the request count |
| Credentials | Not allowed. There are none |

An allowlist on a public API stops nothing determined — anything can send an HTTP request. It stops other people's web pages from silently sourcing traffic from their users' browsers, which is the realistic abuse here.

Two consequences worth stating plainly:

- **Rate limiting is per-IP on a browser-facing endpoint.** Users behind a shared university NAT share a bucket. 30 req/min is generous enough that this should not bite, but it is a real failure mode to watch rather than assume away.
- **No server-side cache exists.** Spec 03's `Cache-Control: public, max-age=900` on `/api/schema` is now the only caching layer, so it matters more than it did.

| Guard | Value | Where |
|---|---|---|
| Per-IP rate limit | 30 req/min, burst 10 | axum middleware (`tower-governor`) |
| Max `per_page` | 200 | request validation |
| Max `from + size` | 10000 | request validation, returns `400 page_too_deep` |
| ES request timeout | 10s, plus `?timeout=10s` on the ES call | reqwest client |
| Concurrent ES requests | semaphore, e.g. 32 | shared app state |
| Body size limit | 16 KB | `DefaultBodyLimit` |
| Empty-query rejection | see above | request validation |

## Errors

Uniform shape: `{ "error": "code", "message": "human readable" }`.

Codes: `empty_query`, `page_too_deep`, `invalid_rank`, `invalid_date`, `invalid_outcome`, `invalid_outcome_method`, `invalid_sort`, `upstream_timeout`, `upstream_unavailable`, `rate_limited`, `internal`.

ES error bodies are logged server-side and **never** forwarded to the client — they leak index names, mapping details, and cluster topology.

## Tests

- Golden-file tests: request JSON → expected ES query JSON. This is where the correlated-nested rule is locked down.
- A negative golden test asserting the attribute conditions are **not** emitted as sibling nested clauses, and the same for event date + place.
- Validation tests for each error code, including a request attempting to filter `event_date_min`.
- Flat/nested equivalence: the same request with and without a method must return the same specimen set. Guards against ETL drift between the `detected` columns and `attributedetail`.

Integration tests against a real ES need fixtures drawn from the real shapes in spec 07, not invented ones:

| Fixture | Asserts |
|---|---|
| `detected: Orthohantavirus` and `immunoblot` on **different** attribute rows | excluded — D18 correlation holds |
| `examined for: ectoparasite` + `detected: ectoparasite: flea` (the `MSB:Mamm:348964` shape) | a search for `detected ectoparasite` **finds** it — D22 expansion works |
| `detected` row with no `examined for` row | included in the `examined` denominator |
| `examined for: ectoparasite` + `detected: ectoparasite: flea` | **excluded** from `examined_no_result` — the `must_not` runs on `.hierarchy` (D40) |
| `examined for: ectoparasite` with no outcome anywhere | included in `examined_no_result` |
| `subfamily = "Arvicolinae; Arvicolinae"` | found by `subfamily: Arvicolinae` — D23 splitting works |
| two events, July and August, top-level date in July (the `MSB:Mamm:321142` shape) | found by an August date filter — D26 holds |
| event in place A on date X, event in place B on date Y | **not** found by (place A + date Y) — event correlation holds |
| no collecting event at all | found by taxon; excluded by any date or place filter (D28) |
| blank `dec_lat` | indexes without a `geo_point` and does not fail the bulk request |
