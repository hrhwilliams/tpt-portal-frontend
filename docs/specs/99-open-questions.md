# Open questions

Interview 2 (2026-07-30) closed OQ1, OQ2, OQ7, OQ8 and OQ9. What remains is either delegated to the dump's author (spec 11) or genuinely undecidable until there is running code.

## Closed in interview 2

| OQ | Resolution |
|---|---|
| OQ1 — topology | **Closed as D38.** Netlify static, browser calls Rust directly. The Rust API is public, unauthenticated, and CORS-allowlisted. `svelte-adapter-bun` must be replaced with `@sveltejs/adapter-static` + `fallback: '200.html'`. Every guardrail in spec 02 became load-bearing |
| OQ2 — pagination | **Closed.** `from`/`size` capped at `from + size <= 10000` for browsing, `search_after` + PIT for export, `track_total_hits: 10000` |
| OQ7 — export granularity | **Closed as D39.** One row per specimen, matched attribute detail in aligned parallel `; `-joined columns. Only matching attributes |
| OQ8 — snapshot metadata | **Closed as D41.** ETL-written metadata document carrying extraction date, row counts, and the D29/D35 assertion results |
| OQ9 — repo layout | **Closed as D45.** Sibling repos. Specs and tools stay in the frontend repo until the backend repo exists |

## Closed by the `test.csv` profiling

| OQ | Resolution |
|---|---|
| OQ3 — negative results | **Closed.** Explicit `not detected` and `not examined for` types exist, but recording is unreliable in both directions and outcome pairing is not string-equality. Resolved as the three-state filter in D21, with absence never treated as negative |
| OQ4 — method field | **Closed.** `attribute_method` is a first-class field, but its values are prose (`comb`, `combed`, `comb w/chloroform`, plus a 140-character serology description). Free-text match, no dropdown, and the form says so (D11) |
| OQ5 — field name | **Closed.** `relatedcatalogeditems` is real; `relatedcatalogdata` does not exist. Query `related_record_cache` (JSON) instead of parsing either |
| OQ6 — Arctos URL | **Closed.** `https://arctos.database.museum/guid/{guid}`, where `guid` already includes the prefix (`MSB:Mamm:151352`). Confirmed from `related_record_cache.record` |
| OQ11 — encumbrances | **Closed.** No encumbered data in scope (D29). ETL still asserts it, so an upstream change fails loudly instead of leaking |

## OQ10 — Case sensitivity — resolved as an analyzer

`term` queries on `family`/`genus` are exact and case-sensitive: `Sorex` matches, `sorex` does not.

Resolved in spec 01 by a `lowercase` filter in the search analyzer on the `.split` and `.hierarchy` subfields, plus a `normalizer` on any keyword field queried directly (`locality_search_terms`, `country`).

**The ETL must not lowercase values.** An earlier draft said "ETL normalizes casing plus a normalizer" — that was wrong on two counts: it is redundant, and it would destroy the display casing, since `_source` is what the results table and CSV render. Analyzers affect matching only and leave `_source` untouched, which is exactly the behaviour wanted here.

## Delegated to the dump's author — see [11-dump-change-requests.md](11-dump-change-requests.md)

OQ12 (array form), OQ14 (`event_count`), and OQ16 (dump scope) are now written up as a request document with counts and example GUIDs, plus a fourth ask for an extraction timestamp. They stay open here until answered, but the next action on each belongs to someone else.

Fallbacks are specified, so none of them blocks building:

| OQ | If refused |
|---|---|
| OQ12 | `text` + `match_phrase` on locality. Loses exact matching and place suggestions (D43 degrades) |
| OQ14 | D26's coverage claim keeps a documented ~0.5% ceiling |
| OQ16 | v2 relationship coverage is lower than measured; publish the resolved rate in the UI |

## OQ12 — `locality_search_terms` as an array

D24 makes it the primary place field, and the array form is what enables exact matching plus a place-name combobox. In the CSV it arrives joined on `", "` while individual terms themselves contain commas (`"United States, New Mexico, San Juan County"` is one term) — so the joined form cannot be split back reliably.

Ask for it as a JSON array, like `json_locality` and `collector_agents` already are. If that's refused, the fallback is `text` + `match_phrase`, which loses autocomplete and exact matching.

## OQ13 — Per-event locality terms (D24 vs D26)

`locality_search_terms` is a record-level rollup; `events` is nested. A nested date cannot be correlated against a top-level place field, so "at Isle Royale **on** that date" is not expressible as specified.

`json_locality` carries per-event `higher_geog`, `spec_locality`, and `locality_name`, so a per-event term bag is buildable — but it won't be as rich as the record-level rollup, which also includes quad names, geocoder names, and HUC codes.

Recommendation: build both. Per-event terms for correlated queries, record-level rollup for recall. The form's locality input targets the rollup unless a date is also set, in which case it targets the events. That's a subtle behaviour difference and needs to be visible in the UI, not silent.

## OQ14 — `event_count` disagrees with `json_locality` (quantified, still unanswered)

3,772 of 741,801 records (0.51%) disagree, and in **both** directions — `event_count` too high on 3,664, too low on 108. So it is not a simple over-count.

Nothing in the build depends on it (spec 01 builds events from the array and ignores the count), but the question of what the missing events *are* stands: is `json_locality` filtered by event type, deduplicated, or truncated? Until answered, D26's coverage claim has a known 0.5% ceiling.

## OQ15 — Sparse columns — closed for this slice

Profiling 741,801 rows resolved it. Only **7** of the 24 columns spec 07 flagged are empty corpus-wide: `continent_ocean`, `culture_of_origin`, `culture_of_use`, `encumbrances`, `infraspecific_rank`, `lastpartlocation`, `member`. The other 17 are populated somewhere.

Vocabularies grew as predicted: 16 detection values (not 6), 16 relationship types (not 5), 84 attribute types (not 35), 74 `guid_prefix` values. See [08-full-dump-validation.md](08-full-dump-validation.md).

Residual caveat: the slice is 97% MSB, so a non-MSB institution may populate the seven.

## OQ16 — How is the production dump scoped? (blocks the v2 relationship feature)

`msb.csv` was built by grepping for `MSB`, so it contains the records at both ends of most relations — which means it resolves cross-institution targets **by construction**. That tells us nothing about production.

Relations point at `UAM:Ento`, `NMU:Para`, `HWML:Para`, `USNPC:Para`, `ANWC:Birds` and 60 more prefixes. If the production dump is strictly MSB-scoped, those become dead ends and the host/parasite feature answers for materially less of the graph than the 86.6% measured here.

This is fixed by widening the dump, not by writing code. Worth settling before v2 is scheduled.
