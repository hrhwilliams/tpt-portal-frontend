# TPT specimen search portal — design

A public, unauthenticated web portal for searching natural history specimen records drawn from Arctos. A researcher constrains a search by taxon, place, collection date, collector, and any number of specimen attributes, and gets a paginated, CSV-exportable table of specimens. The whole query lives in the URL, so a search is citable in a manuscript.

This document is the design of record. The specs in [docs/specs/](specs/) remain authoritative on their own subjects; where this document and a spec disagree, this document is newer — see [What this supersedes](#what-this-supersedes).

---

## Shape of the system

```
Netlify — static assets, SPA fallback
     │
  browser ──CORS──▶ Rust axum service (public, unauthenticated)
                          │
                          ▼
                   Elasticsearch 9.x
                          ▲
                          │  alias swap, per snapshot
                    ETL (Python)  ◀── periodic Arctos dump
                                  ◀── Arctos code tables
```

Four moving parts, in two repos. The frontend is SvelteKit, statically built, with no server runtime — nothing in that repo can hold a secret. The Rust service is the sole Elasticsearch client and the only place credentials exist. The ETL is a batch job, not a live sync.

**The Rust API sits on the open internet.** There is no proxy, no gateway, no second layer. Rate limiting, result-window caps, export caps, body-size limits, and a CORS origin allowlist are the entire defence (D15).

**The index is rebuilt, never patched (D2).** Each dump produces a new concrete index; the API reads through an alias that is moved atomically once the new index passes its assertions. The previous index is retained one cycle for rollback. Data is therefore stale by design, and the snapshot date is displayed in the UI rather than left for the user to assume.

---

## The query model

Four groups, in the order a specimen scientist thinks.

**Taxon.** A rank and a name. Ranks offered: phylum, class, order, family, subfamily, genus, species. Subfamily is not optional — the taxonomy in this source places the vole group at `subfamily = Arvicolinae` under `family = Cricetidae`, and a form without subfamily cannot express it. The name field is a combobox backed by a separate taxon-name index carrying record counts and each name's parent, so a user sees `Arvicolinae (subfamily, in Cricetidae) — 4,112 records` before they commit to a search. Suggestions fill the field; they never constrain it. A valid name absent from the current snapshot must still be searchable.

**Place and date.** Locality matches whole place names against the record's search-term rollup. Country and state are separate record-level filters. Dates bound the _collection_ event, not the determination or the test.

**Attributes.** Repeatable rows. Each row is a type, a value, and an optional NOT. Rows combine with AND. This is the portal's substantive capability and is described in full below.

**Collector.** Resolved to an Arctos agent identifier rather than matched on a name string, so spelling variants of the same person collapse. Note that collectors are frequently projects or crews, not individuals.

Every field is optional, but at least one must be present. An unconstrained match-all against a corpus of this size is rejected outright.

---

## Attribute pairs

The earlier design offered a fixed four-state outcome control over the detection attributes alone. It is replaced by a general mechanism: **repeatable (type, value) rows, AND-combined, each row optionally negated.**

The type list is every attribute type Arctos documents, minus the three it marks non-public. When the chosen type is vocabulary-backed, the value input becomes a dropdown of that vocabulary; otherwise it is free text. Arctos declares this per type, so the form derives it by lookup rather than by a hardcoded list — adding a type upstream costs no frontend change.

This generalisation is the point. The previous outcome enum had to decide, on the user's behalf, what "examined for a parasite with no result ever recorded" ought to mean. With pair rows the user composes it:

```
    examined for  =  ectoparasite
NOT detected      =  ectoparasite
```

No preset, no inference, no arbitrary decision baked into the product. The same mechanism reaches sex, life stage, location in host, parts examined, and every measurement type, none of which the enum could express at all.

### Rules the mechanism depends on

**Each row is one clause, and conditions inside a row must hold together (D18).** A specimen carries many attribute rows, and method, date, and determiner vary between them. Two pair rows are correctly two independent assertions. Splitting a single row's conditions apart would match a specimen where the value came from one attribute record and the method from an unrelated one — a query that compiles, runs fast, and is scientifically wrong. The form's structure now enforces this rather than a rule in the backend having to.

**Values are colon-delimited paths, and searching a parent finds its children (D22).** `ectoparasite: flea` is a child of `ectoparasite`. Ancestor expansion happens in the index, not in the ETL, so a search for `ectoparasite` finds flea and louse records with no wildcard. This is also what makes outcome pairing work: an `examined for: ectoparasite` row pairs with a `detected: ectoparasite: flea` row, which naive string equality would miss. The convention is Arctos' own — the authority definition prescribes `category: term` and directs recorders to use the most general term available.

**Taxonomy fields are multi-valued (D23).** A single record may carry `Echinostomata; Digenea` in one rank column. Splitting is an index-time concern, not an ETL one. Exact matching against the raw field misses these silently.

**Method is one input, replicated into every row.** It reads as "every attribute I asked about was recorded by this method," which is unambiguous and preserves correlation. **Method is disabled whenever any row is negated** — "no detected-X row _by this method_" still matches a specimen with a positive found another way, which is a false negative in the worst possible direction. The combination is refused in the form and rejected by the API.

---

## What the data forces

These are not caveats appended to a finished design. Each one changed the design.

**Absence of a result is not a negative result.** The four detection types — examined for, not examined for, detected, not detected — form a matrix that the corpus occupies in _every_ combination. Three combinations carry the large majority of records and represent normal practice. The remainder include examinations whose outcome was never written down, positives recorded with no examination row, and a small number of records asserting both poles of a contradiction. Treating a missing `detected` row as a negative would silently convert a substantial population of unknowns into negatives and inflate the negative count materially. It is not done anywhere in this system, and the UI says so where a user could otherwise assume it.

**The portal does not grade the data it searches.** The matrix above is evidence about how to build the query, not a quality score to expose. There is no "incomplete record" filter and no data-quality badge. Rating records is a different product; this one finds what is there, including the parts that are untidy. The same line applies to controlled vocabularies: a value absent from its code table is indexed and logged, never rejected (D37).

**Test method is prose, not vocabulary.** It has no code table, and it will not have one. Four spellings of "comb" occur in a 199-row sample; the bulk of the corpus predates attribute metadata entirely and carries no method at all. The input is free text, matching is approximate, and the form states this rather than implying precision.

**Attribute date is frequently the load date, not the test date.** One record's own remark says as much. It is exported for provenance under a header that does not call it a test date, and it is not offered as a filter.

**A specimen can have several collecting events, so date and place filtering must run per event.** The top-level date misses second events. Events are kept unmerged and undeduplicated: roughly two percent of specimens carry several, and "three events" usually means one visit georeferenced three ways rather than three collections. Results rows expand to show every event, which is the only presentation that makes that legible (D26).

**Political geography is record-level; the source has no per-event country or state.** A country filter is therefore not correlated with an event date. Rare in practice, and the alternative — splitting a joined geography string positionally — would invent data. It is stated in the UI, not fixed in the ETL.

**Some dates are year- or month-only, and that is real information.** A year-only date sorts and ranges as 1 January, so a mid-year range misses it. Handled by accepting multiple date formats at index time; the form warns. Coercing these upstream would fabricate precision.

**Restricted data must be excluded by assertion, not by observation.** Arctos flags three attribute types as non-public, and flags records with access restrictions. None occur in the sample corpus — which is exactly why the ETL asserts their absence and fails the build if that changes, rather than relying on it staying true (D29, D35). On a portal with no authentication, this is the one failure mode that leaks rather than merely returning too little.

### The governing principle

**The index may reshape a value. It must not invent one.**

Reshaping — value hierarchies, multi-valued splitting, case-insensitivity, partial dates — is index configuration. Deriving is code that can silently stop working and return fewer results with no error. That line has moved twice during design, both times toward less code, because the data turned out to already contain what earlier drafts proposed to derive. What remains genuinely derived is small: nested events, a role-filtered collector rollup, and normalising relationship targets to an identifier.

---

## Results and export

**One expandable row per specimen.** Collapsed, it shows the matched event. Expanded, every event with its date, locality, and coordinates. Catalog numbers link back to the Arctos record. Records with no collecting event show "no locality recorded" rather than an empty cell, so missing is distinguishable from not-matching.

**Browsing is capped; export is not.** Page numbers work to a bounded depth, beyond which the UI says so and points at the export. Exact result counts above a ceiling are reported as "10,000+" rather than as a fabricated number. Nobody browses to page four hundred; they export.

**CSV is one row per specimen, streamed.** Matched attribute detail goes into aligned parallel columns: the *n*th element of `matched_value`, `matched_method`, `matched_date` and their siblings all refer to the same underlying attribute record. Every such column carries the same element count on every row, including empty ones — the invariant that keeps the alignment from silently lying. Only attributes matching the query are exported, with a count of how many the specimen has in total so the elision is visible.

Each export carries its query parameters, the snapshot date, and the per-record licence statement verbatim. Licences vary by record, and most of this corpus is non-commercial — that matters to whoever receives the file.

---

## Scope boundary

**In v1:** taxon search with autocomplete, place and date search, the attribute pair mechanism across all attribute types, collector search, results with expandable events, streamed CSV export, and a data-driven form whose vocabularies come from the Arctos code tables rather than from whatever happens to be in the current snapshot. A value with zero records is shown and disabled, never omitted — a vanishing option is indistinguishable from one that never existed.

**Not in v1:** the relationship query UI, facets, a map, part-based filters, saved searches.

**The relationship mapping ships in v1 even though the query does not.** Reindexing a corpus this size later is expensive; adding a query path to an existing mapping is not.

### Why relationship search is the v2 headline

The corpus records host–parasite links directly: a parasite specimen is `parasite of` a host, and the host carries the inverse. Both directions are stored natively, and the host records are complete specimens rather than stubs — an earlier design that synthesised the inverse direction and traversed placeholder records was withdrawn once the full slice showed neither was necessary. The related record's family travels with the link, which is what lets "hosts of any Taeniid cestode" resolve in a single query with no taxonomy lookup at search time.

Two limits, both honest:

**The same question has two different answers, and they are not interchangeable.** An attribute assertion — _a cestode was detected in this host_ — and a relationship — _this catalogued parasite specimen is linked to this host_ — are different claims. The second is strictly stronger and returns fewer records. A v2 UI must not blur them.

**A share of relationship targets are not resolvable identifiers** — barcodes, field numbers, foreign catalogue numbers. The rate measured against the sample slice is not generalisable: that slice was assembled by following relationships, so it resolves cross-institution targets by construction. The true rate depends on how the production dump is scoped, which is an open question with the dump's author. Whatever it turns out to be, it gets published in the UI. A feature that silently answers for part of the graph is worse than one that states its coverage.

---

## What this supersedes

Decisions taken while writing this document, against the specs as they stand:

| Change                                                            | Effect                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attribute pair rows replace the four-state outcome control        | The outcome enum is gone from the form, the schema response, and the API contract. Its states remain expressible, composed by the user                             |
| Pair rows cover all attribute types, not the four detection types | Value input is a dropdown when the type is vocabulary-backed, free text otherwise                                                                                  |
| Per-row NOT                                                       | Negation compiles to an exclusion clause; the previously specified refusal of "examined with no outcome, by method" generalises to _any_ negated row plus a method |
| One method input, replicated into each row                        | Preserves correlation with a single control                                                                                                                        |
| No data-quality filter or badge                                   | The detection matrix informs the design; it is not exposed as a rating                                                                                             |

The specs have not yet been revised to match. Specs 02, 03 and 04 describe the outcome enum, and spec 01's flat detection arrays are retained as a fast path for simple unnegated rows but are no longer the primary query path.
