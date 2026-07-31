# Spec 04 — Search form + URL state

SvelteKit. Depends on specs 02 and 03.

## The core rule

**The URL is the state.** No form-state store drives the search. Form inputs write to the URL; a `load` function reads the URL and fetches results. Consequences that follow for free: back/forward works, refresh works, links are shareable, and a query is citable in a paper (D17).

```
/search?rank=genus&taxon=Sorex&locality=Isle+Royale+National+Park&from=1994-01-01&to=1994-12-31
        &value=virus%3A+Orthohantavirus&outcome=detected&method=immunoblot
        &page=1&per_page=50&sort=guid_asc
```

Rules:

- Empty inputs are **absent** from the URL, never `&locality=`. Keeps shared links readable and makes the canonical form of a query stable.
- Param names are short and stable — they are a public API the moment someone pastes a link into a manuscript. Renaming one breaks published citations.
- Submitting the form is `goto(newUrl)`, not a fetch. The `load` function owns all fetching.
- Changing any filter resets `page` to 1. Changing `page` or `sort` preserves everything else.

## Routes

| Route     | Responsibility                                                           |
| --------- | ------------------------------------------------------------------------ |
| `/`       | Landing: what the portal is, one worked example query, link to `/search` |
| `/search` | Form + results. `load` parses the URL, validates, calls the search API   |

`/search` with no params renders the empty form and does not call the API (spec 02 rejects empty queries anyway).

## Form structure

Three groups, in the order a specimen scientist thinks:

1. **Taxon** — rank `<select>` (options from `/api/schema`) + an autocomplete combobox backed by `/api/taxa` (D42, spec 10). The field stays free text: suggestions fill it, they never constrain it.
2. **Place & date** — locality, country `<select>`, state/province, collected-between date pair.
3. **Analysis** — value `<select>` (from schema), outcome radio group, method text.
4. **Collector** — optional; name input resolving to an `agent_id`.

### The Analysis group carries the data's honesty problem

Outcome is a radio group of exactly four (D40):

- **Detected** — a positive result is recorded
- **Not detected** — a negative result is recorded
- **Examined, no result recorded** — examined for it, and no outcome was ever written down
- **Any record of examination** — the denominator: any of the above

The third is the state spec 07 identified and D21 originally folded into the denominator. Making it selectable turns a caveat into a query: a user can now _find_ the records the caveat is about, which is the difference between telling someone the data is incomplete and showing them where.

Selecting it **disables the method input**, driven by `allows_method: false` from `/api/schema`. "Examined by this method with no result recorded" is unanswerable — the method lives on the attribute row, and this state is defined by the absence of the rows that would carry one. Spec 02 rejects the combination server-side; the form should never send it. Show a short reason next to the disabled input rather than greying it out silently.

Alongside it, a persistent note, not a dismissible tooltip:

> Results reflect what was recorded. A specimen with no result row is not a negative — it may have been examined with the outcome unrecorded, or never examined. "Not detected" returns only explicitly recorded negatives.

This is not polish. The four underlying states (spec 07) do not partition cleanly, and a user comparing "detected" against "not detected" counts will compute a prevalence figure that is wrong unless they know the denominator is incomplete.

**Arctos says the same thing, and citing it beats paraphrasing it.** The `ctexamined_detected` documentation states these data _"cannot be Research Grade by themselves"_ and should be accompanied by parts, relationships, or other direct evidence. Link `https://handbook.arctosdb.org/best_practices/examined.html` from the note (spec 09).

The value `<select>` is populated from the code table, so it lists **all 32 controlled values**, not only those with records (D36). Consequences for the form:

- Children indent under parents — selecting `ectoparasite` includes `ectoparasite: flea` and `ectoparasite: louse` (D22). Depth never exceeds 2, guaranteed by the code table.
- Each option carries the authority's own description in its `title`: _"Ticks are parasitic arachnids in the order Ixodida."_ This is what disambiguates `parasite` from `endoparasite` without the user guessing.
- Values with **0 records in the current snapshot are shown with their count and disabled**, not omitted. A vanishing option is indistinguishable from a value that was never offered; "0 records" tells the user their search is well-formed and the corpus is empty for it.

The method input is free text with placeholder guidance and a note that method is recorded as prose, so matching is approximate — `comb` will not find `combed` (D11).

### The date inputs

Two notes the data forces, both small and both the kind of thing that otherwise silently loses records:

- **Some dates are year- or month-only.** Elasticsearch reads `1950` as 1 January 1950, so a range of `1950-06-01 … 1950-12-31` will not match a record dated only `1950`. That is ~650 collecting dates in a 741,801-row slice. Say so under the inputs (D33).
- **Country and state are not correlated with the date.** They are record-level, because the source has no per-event political geography (D34). A specimen collected in two countries can match a country-A + date-in-country-B search. Rare, and the alternative is guessing at a joined geography string.

### The locality input

`locality_search_terms` matches whole place names, so `Isle Royale National Park` works and `Isle Royale` does not. Exact matching stays the fast path (D43) — but a bare "0 results" for a place that plainly exists is the worst failure this form can produce.

**Zero results trigger a suggestion query, and only then.** On an empty result set the page runs a prefix aggregation over `locality_search_terms` and offers up to 10 real place names:

> No matches for **Isle Royale**. Did you mean: _Isle Royale National Park_ (312) · _Isle Royale, Keweenaw County_ (47)?

Suggestions are links that re-run the search, so they stay URL-addressable (D17). The expensive query runs only after the cheap one has already failed, so the common case pays nothing.

If spec 11's request 1 lands the array, this becomes a live combobox and the ambiguity disappears entirely. Until then, exact-plus-suggestions is the honest compromise: precise when the user knows the name, recoverable when they don't.

### Zero-result recovery is a shared component

The locality suggestion behaviour and the taxon combobox (spec 10) solve the same problem at different moments — before submission and after. Build the "did you mean" affordance once and use it for both, so a mistyped genus and a mistyped place fail the same way rather than in two different styles.

## Data-driven rendering

`/api/schema` is fetched in the root layout `load` and passed down. If it fails, the page renders with a banner and the selects fall back to free-text inputs — degraded but usable. `limits` from the schema drives client-side max values so they cannot drift from the backend.

**D38 means `load` runs in the browser, not on a server.** Netlify serves static assets and there is no SvelteKit server runtime, so:

- The schema fetch is a client-side request to the public Rust API, with no server-side cache in front of it. `Cache-Control: public, max-age=900` from spec 03 is the only caching layer, and the browser honours it across navigations.
- The API base URL is build-time public config (`PUBLIC_API_BASE`). Nothing secret can live in this repo — there is nowhere in it that a secret would stay secret.
- `/search` cannot be prerendered, so the static build needs an SPA fallback (`fallback: '200.html'`). Without it, a shared query URL 404s on first load — which would break D17's citable-URL promise in the most visible way possible.
- First paint has no data. The form renders from cached or default schema and fills in when the fetch resolves; it must not block on it.

## Validation

Client-side validation mirrors spec 02 and exists only for fast feedback; the backend is authoritative. Validate: at least one filter present, date order (`from <= to`), `per_page <= max_per_page`, `page` within `max_result_window`.

Invalid URL params (a hand-edited or truncated shared link) render a clear "this link isn't valid" message naming the bad param — not a blank page or a 500.

## Accessibility

Native `<form>`, real `<label for>` on every input, fieldset+legend per group, submit works without JS if the SvelteKit setup allows a GET form, results count announced via `aria-live`. This is a public research tool at a public institution; keyboard and screen-reader use is a requirement, not a nice-to-have.

## Not in v1

Saved searches (needs accounts, D15), facets (D14), map (D14), relationship search (D7, re-confirmed as D46).

Taxon autocomplete **is** in v1 — D13 was reversed by D42. See spec 10.
