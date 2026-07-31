# Building this project

Read [DESIGN.md](DESIGN.md) first for _what_ is being built. This is _how_, and
what to pick up next.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # types
npm run lint
```

`npm run fixtures` regenerates the data the form reads. You do not need the
7.2 GB `msb.csv` for any of the above — see [Fixtures](#fixtures).

## What a fixture is here

**A fixture is a JSON file standing in for an API endpoint that does not exist
yet.** `/api/search` is live now; `/api/schema` and `/api/taxa` are not.
Rather than mock them with invented data, the fixtures are generated from the real
Arctos code tables and a real slice of the dump, so the form exercises real
vocabulary sizes, real value shapes, and real record counts.

| Fixture                        | Stands in for     | Generated from                                                            |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------- |
| `src/lib/fixtures/schema.json` | `GET /api/schema` | `docs/data/code-tables/*.json` + `docs/data/profiles/prefix_sciname.json` |
| `src/lib/fixtures/taxa.json`   | `GET /api/taxa`   | `docs/data/dataset/test.csv` (199 rows) + the same profile                |

Both are written by `tools/build_fixtures.py` (`npm run fixtures`). **Never hand-edit
them** — regenerate instead.

There is a third layer worth distinguishing, because "fixture" gets used loosely:

- **Code tables** (`docs/data/code-tables/`) — Arctos' published controlled
  vocabularies, fetched by `tools/fetch_code_tables.py`. Source data, not a fixture.
- **Profiles** (`docs/data/profiles/`) — counts and distributions extracted from
  the 7.2 GB slice by the `profile_*.py` scripts. Committed precisely so that
  nobody needs the slice to build. Derived, but checked in.
- **Fixtures** (`src/lib/fixtures/`) — the two files above, shaped like API
  responses. Derived from the other two.

Each fixture is deleted when its endpoint lands and the `load` fetches instead —
which is what happened to the search translation.

`docs/data/dataset/msb.csv` is **not in the repo**. Only the profilers need it.

## What exists now

```
src/routes/+page.svelte          landing, worked-example links
src/routes/search/+page.ts       load: URL -> GET /api/search -> hits
src/routes/search/+page.svelte   the three-block form + results table
src/lib/query.ts                 URL <-> SearchQuery, validation
src/lib/types.ts                 SearchQuery, Schema, and friends
src/lib/components/              TaxonRows, AttributeRows, TaxonCombobox, MultiSelect
tools/                           profilers, fixture generator
```

A search calls the Rust service: `load` forwards the page's own query string to
`GET {__API_BASE__}/api/search` and renders the list of hits it returns. The base
URL is a `define` in `vite.config.ts`. **The URL grammar in `src/lib/query.ts` is
the API request format**, so the two cannot change independently.

## Next steps, in order

Each is independently shippable. Stop anywhere.

### 1. Results table (spec 05)

`+page.ts` returns `hits`; the page renders a bare table whose columns are
whatever the service sent. Spec 05's table replaces it:

- One expandable row per specimen; collapsed shows the matched event, expanded
  shows all of them with dates and coordinates.
- `10,000+` when the count is a lower bound. Never a fabricated exact number.
- "no locality recorded" for eventless records, so missing reads differently
  from not-matching.

### 2. Pagination

`from`/`size`, capped so `from + size <= 10000`. Page number lives in the URL and
is already in `SearchQuery`. Changing a filter resets to page 1 (already handled
in `submit`); changing the page preserves everything else.

### 3. CSV export (spec 05)

Client-side from the current page is a two-hour job and useful immediately.
The real thing streams from the backend with PIT + `search_after` — do not build
that here. The one invariant worth a check: every `matched_*` column has the same
element count on every row, including empties.

### 4. The Rust service

**`axum::extract::Query` will silently drop repeated params.** The URL grammar
repeats `taxon`, `attr` and `prefix`; `serde_urlencoded` keeps only the last of
each. Use `serde_qs` or `axum_extra::extract::Query`. This matters for
`GET /api/export`, which takes search params in the URL.

### 5. Adapter swap

`svelte-adapter-bun` contradicts the chosen topology (static hosting, no server
runtime). Replace with `@sveltejs/adapter-static` and `fallback: '200.html'`, so
a shared query URL does not 404 on first load. Note the config lives in
`vite.config.ts`, not `svelte.config.js`.

## Conventions worth not relitigating

**The URL is the state.** No store drives a search. Inputs write to a local
buffer, submit is a `goto`, and `load` reads the URL. Param names are a public
API the moment someone pastes a link into a paper — renaming one breaks published
citations. Legacy `?rank=&taxon=` still parses for that reason.

**`q` must be `$state`, not a writable `$derived`.** `$derived` does not proxy its
value, so pushing a row through `bind:` would not re-render. There is an
eslint-disable and a comment on it; the lint rule's suggestion is wrong here.

**Query the analysed subfield, never the bare keyword** — `.hierarchy` for
attribute values, `.split` for taxonomy. The bare field is for display and CSV.
Getting this wrong returns fewer results with no error. It is the Rust service's
rule now, and belongs in its golden-file tests.

## Testing

Three layers, cheapest first:

|                          | Covers                                                         | Run     |
| ------------------------ | -------------------------------------------------------------- | ------- |
| `npm run check` / `lint` | types, a11y lint                                               | seconds |
| `npm run test:e2e`       | clicking: adding rows, AND/OR, NOT, multi-select, autocomplete | ~10s    |

Playwright starts the dev server itself (`reuseExistingServer`), so no setup.

**Clicks before hydration are swallowed** — the SSR'd markup has no handlers yet.
`e2e/form.spec.ts` has an `open()` helper that waits; use it instead of
`page.goto` or the test fails confusingly, with a snapshot showing the click
simply did nothing.

**Do not wrap a `<select>` in its `<label>`.** The option text folds into the
accessible name, so the control announces as "Rank — choose — Scientific name
Phylum Class…". Use `for`/`id`. Playwright's strict mode catches this, which is
how it was found.
