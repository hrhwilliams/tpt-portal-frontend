# TPT specimen search portal — specs

Small, independently buildable specs. Read `00-decisions.md` first; it records what was confirmed and why.

| Spec | Scope | Depends on |
|---|---|---|
| [00-decisions.md](00-decisions.md) | Confirmed decisions D1–D34 | — |
| [01-index-mapping.md](01-index-mapping.md) | Mapping v2, new fields, alias-swap reindex | — |
| [02-search-api.md](02-search-api.md) | `POST /api/search`, ES query translation, guardrails | 01 |
| [03-schema-api.md](03-schema-api.md) | `GET /api/schema`, vocab caching | 01 |
| [04-frontend-form.md](04-frontend-form.md) | Search form, URL-as-state | 02, 03 |
| [05-results-and-export.md](05-results-and-export.md) | Results table, pagination, streamed CSV | 02, 04 |
| [06-v2-relationship-search-sketch.md](06-v2-relationship-search-sketch.md) | Host/parasite search — v2 query UI, v1 ETL | 01, 07 |
| [07-data-validation.md](07-data-validation.md) | What `test.csv` (199 rows) contains. **Partly superseded by 08** | — |
| [08-full-dump-validation.md](08-full-dump-validation.md) | The 741,801-row MSB slice. Corrections win over 07 | — |
| [09-code-tables.md](09-code-tables.md) | Arctos authority API — vocabularies, descriptions, and the `public: 0` filter | — |
| [10-taxon-autocomplete.md](10-taxon-autocomplete.md) | `taxa` index + `GET /api/taxa`. In v1 as of D42 | 01 |
| [11-dump-change-requests.md](11-dump-change-requests.md) | Four asks for whoever generates the dump | 08 |
| [99-open-questions.md](99-open-questions.md) | What's left. Nothing blocks code anymore | — |

## v1 in one sentence

A public, unauthenticated portal where a researcher picks a taxonomic rank and name, a place, a collection date range, and an analysis (value + outcome + method), and gets a paginated, CSV-exportable table of specimens — with the whole query addressable as a URL.

## Shape of the system (D38)

```
Netlify (static assets, SPA fallback)      <- @sveltejs/adapter-static
        |
   browser  --CORS--> Rust axum service (public, unauthenticated)
                            |
                            v
                      Elasticsearch 9.x
```

No SvelteKit server runtime. `load` runs in the browser, the API base is public build config, and nothing in this repo can hold a secret. **The Rust API is on the open internet** — spec 02's guardrails are the only defence, not a second layer.

Frontend is designed first, against the API contract in specs 02, 03 and 10 as though it already existed. The Rust service is a sibling repo that does not exist yet (D45).

## Build order

1. **Spec 04** — the form, against the contract as specified. This is the top-down step: what the frontend needs is what the backend will owe it.
2. **Spec 05** — results table and export.
3. **Spec 01** — mapping and ETL. Nothing runs without it; read specs 07, 08 and 09 first, because they are why the mapping looks the way it does.
4. **Specs 02 + 03 + 10** — one axum service, three endpoints.

Steps 1–2 are frontend and can proceed now. If the contract turns out to be wrong while building them, **change the spec** — that is the point of designing this way round, and specs 02/03/10 have no code depending on them yet.

When backend work starts, build it against fixtures drawn from the shapes in spec 08's tables, not invented ones. The interesting bugs all involve real record shapes.

## The five things most likely to be built wrong

Items 1–4 fail the same way: fewer results, no error, plausible-looking output. Spec 02 pins each with a test. Item 0 fails in the opposite and worse direction — more data than intended.

0. **Indexing an attribute type Arctos marks non-public (D35).** Not a wrong-answer bug — a disclosure bug, on a portal with no auth. Zero occurrences today, which is exactly why it must be asserted rather than observed.
1. **Uncorrelated nested clauses (D18).** Attribute value and method must sit inside a *single* `nested` clause. Three sibling clauses compile, run fast, and are scientifically wrong.
2. **Querying a bare keyword field instead of its analyzed subfield.** `.hierarchy` for values (D22), `.split` for taxonomy (D23). The bare field is for display and CSV only.
3. **Filtering on the top-level date (D26).** Misses second events on multi-event records.
4. **Deriving in the ETL what an analyzer already does.** See below.

## Derived state is the thing to keep minimizing

**The index may reshape a value. It must not invent one.** That is the line, and it has now moved twice — both times toward less code, because the data turned out to contain what the specs proposed to derive.

Reshaping (keep): value hierarchy, multi-valued taxonomy splitting, case-insensitivity, partial-date formats. All four are analyzer or mapping configuration, not ETL. Skipping them returns fewer results with no error.

Genuinely derived, because Elasticsearch has no equivalent: nested `events` (including synthesizing one when `json_locality` is empty), the role-filtered collector rollup, and normalising relation targets to a GUID. Spec 01 lists both categories, plus a third table of derivations that were **removed** — check it before reintroducing one.

Removed by the full-slice profile (spec 08): inverse relation edges, `MSB:Host` stub traversal, the two-pass classification join, partial-date coercion, and per-event political geography. The first three were the whole of D30's ETL.

## Also worth knowing

- "Arvicolidae" is `subfamily = Arvicolinae` under `family = Cricetidae`. The interviewee's rank was off by one, and subfamily is therefore mandatory in the form.
- "Absence of a `detected` row" is not a negative result. It conflates true negatives, unrecorded outcomes, and never-examined. D40's four-state outcome filter exists for this, and Arctos' own handbook says the same thing (spec 09).
- The inverse relationship is named **`host of parasite`**, not `host of`. It exists, 54,059 times. Spec 07 says otherwise and is wrong — see D31.
- Arctos publishes its controlled vocabularies with documentation. `ctattribute_type.value_code_table` says which fields have one; `ctattribute_type.public` says which must never leave Arctos. Spec 09.
- A 199-row sample was enough to find every structural problem and wrong about nearly every rate and vocabulary. Both profiling scripts are in [tools/](../../tools/); run them against each snapshot.
