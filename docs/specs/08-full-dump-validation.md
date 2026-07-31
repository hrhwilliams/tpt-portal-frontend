# Spec 08 — Validation against the full MSB slice (`msb.csv`)

Sample: **741,801 rows × 154 columns, 7.27 GB** — every MSB record plus every record reachable by a grep for `MSB`. 3,700× the `test.csv` sample behind [07-data-validation.md](07-data-validation.md).

Spec 07 stays as written; it is the record of what the small sample supported. This spec is the corrections. Where the two disagree, **this one wins**.

Reproduce with `tools/profile_msb.py` (broad pass) and `tools/profile_msb2.py` (targeted pass).

Not a random draw: 97% MSB, and the non-MSB records are present only because they are related to an MSB record. Institution-level generalisations are still unsafe. Everything about *structure* is now reliable.

## Corrections — things the specs got wrong

### 1. `host of parasite` exists. Inverse-edge synthesis is not needed (D30)

The single biggest correction. Spec 06, spec 07, and D30 all assert there is no `host of` edge in the dump and require the ETL to synthesize one. That came from 37 relation rows.

At 170,984 relation rows the vocabulary is **16 relationship types**, and inverses are stored natively:

| Relationship | Rows | Inverse | Rows |
|---|---:|---|---:|
| `parasite of` | 57,485 | `host of parasite` | 54,059 |
| `parent of` | 3,450 | `offspring of` | 3,284 |
| `same individual as` | 40,442 | *(symmetric)* | — |
| `collected with` | 7,865 | *(symmetric)* | — |
| `same lot as` | 3,602 | *(symmetric)* | — |
| `sibling of` | 686 | *(symmetric)* | — |
| `eaten by` | 18 | `ate` | 15 |
| `associated with` 48, `in amplexus with` 14, `littermate or nestmate of` 10, `same series as` 2, `mate of` 2, `same edition as` 2 | | | |

The name is `host of parasite`, not `host of` — which is why a grep of the sample found nothing.

And the edges sit on the correct records:

```
parasite of        held by  MSB:Para 55,477 · NMU:Para 1,020 · HWML:Para 861 · USNPC:Para 99
host of parasite   held by  MSB:Mamm 27,100 · MSB:Host 18,831 · UAM:Mamm 6,798 · MSB:Bird 532 · MSB:Herp 421
host of parasite   points at  MSB:Para 49,859 · UAM:Ento 1,944 · NMU:Para 938 · HWML:Para 927
```

**Consequence:** delete inverse synthesis from D30 and spec 06. The `inferred` flag, the "don't double up symmetric relations" rule, and the "whose record wins" question all disappear. The relations field becomes a copy of `related_record_cache`.

The 3,426-row gap between `parasite of` and `host of parasite` is worth measuring rather than filling — the likely cause is edges whose other end sits outside this slice. Measure it; do not synthesize into it.

### 2. `MSB:Host` records are complete records, not stubs. No traversal needed (D30)

Spec 06 calls them "thin stubs (`parts = media`)" that must be followed through `same individual as` to reach the real specimen. Across all **25,708** `MSB:Host` records:

| Field | Populated |
|---|---|
| `scientific_name` | 25,708 (100%) |
| `began_date` | 25,702 (99.98%) |
| `locality_search_terms` | 25,702 (99.98%) |
| `collector_agents` | 25,689 (99.9%) |
| `family` | 25,403 (98.8%) |
| `genus` | 25,079 (97.6%) |
| `subfamily` | 15,455 (60.1%) |
| `host of parasite` edge | 18,831 (73.3%) |
| **`same individual as` edge** | **863 (3.4%)** |

`parts = media` on 22,863 of them is a statement about preparation, not about record completeness. They carry the collector, the locality, and the taxonomy the flagship query needs, **directly**.

Only 3.4% have a `same individual as` edge at all, so the two-hop path is not the common case — it is a rare enrichment. The `test.csv` sample had four `MSB:Host` records and gave the opposite impression.

**Consequence:** delete host-stub traversal from D30 and spec 06. With correction 1, D30 collapses entirely.

### 3. The two-pass taxonomy join is probably not needed either

Spec 06 requires a two-pass ETL join because `related_record_cache` carries only `family`. That is still true. But the flagship query — *"hosts of Taeniid cestodes (including Echinococcus)"* — filters the related record at **family** level, which the cache already has. The host side (`Arvicolinae`) is the record's own taxonomy, native.

So the join buys related-record filtering at ranks *other than* family. Nothing in either interview query needs that.

**Recommendation:** ship v2 relations from the cache alone. Add the join if and when a user asks for a non-family related rank. This is the third and last of the "ETL invents data" items, and dropping it removes the entire two-pass architecture from v1.

### 4. Dates are not all `YYYY-MM-DD` — but Elasticsearch handles it

Spec 07 says "100% clean ISO". At scale:

| Field | Clean `YYYY-MM-DD` | `YYYY-MM` | `YYYY` | Datetime `…T HH:mm` | Empty |
|---|---:|---:|---:|---:|---:|
| `attribute_date` | 2,308,842 | 7,099 | 4,659 | 0 | 167,494 |
| `began_date` | 737,075 | \| | — 656 combined — | \| | 4,070 |
| `ended_date` | — | \| | — 646 combined — | \| | — |

No garbage values at all — every non-ISO value is a *shorter* or *longer* ISO prefix. So this is a `format` list on the existing `date` field, not an ETL step and not a fallback to `keyword`:

```json
"format": "strict_date_optional_time||yyyy-MM-dd||yyyy-MM||yyyy"
```

**One honesty caveat, which is a UI matter, not a data matter:** Elasticsearch parses `1950` as `1950-01-01`. A range filter of `1950-06-01 … 1950-12-31` will not match a record dated only `1950`. That affects 4,659 attribute dates and ~650 collecting dates — small, but a date-range search silently excluding year-only records is exactly the failure mode the rest of these specs try to avoid. Say so next to the date input.

### 5. `json_locality` has no `country`, `state_prov`, or `county`

Spec 01 maps `events.country` / `events.state_prov` / `events.county`, and spec 02's example query filters `events.country`. **Those fields do not exist in the source.** The 30 keys actually present per event are:

```
specimen_event_id  specimen_event_type  began_date  ended_date  verbatim_date
higher_geog  spec_locality  locality_name  verbatim_locality  locality_id
locality_remarks  geog_auth_rec_id  coordinates  coordinate_error  max_error_distance
max_error_units  datum  georeference_protocol  verificationstatus  elevation  depth
habitat  collecting_method  collecting_source  assigned_agent  assigned_date
verified_agent  verified_date  event_attributes  locality_attributes
```

Political geography exists only inside `higher_geog`, a `, `-joined string. Splitting it into country/state/county is ETL invention with a positional guess — exactly what we are trying not to do.

**Consequence:** drop `events.country` / `state_prov` / `county` from the mapping and from spec 02's query. Keep `events.higher_geog` as `text`. Country and state stay **record-level** filters, from the top-level columns which do exist. This slightly widens the D24-vs-D26 tension already recorded — a country filter is not correlated with a nested event date — and that is the honest position given the source.

Two fields worth adding while the shape is being corrected: `events.habitat` and `events.verificationstatus`. Both are present on every event and both are free.

### 6. `use_license_url` is always two `; `-joined URLs

741,801 of 741,801 rows carry exactly two values — a terms-of-use URL and a Creative Commons URL:

```
http://arctosdb.org/home/data/; https://creativecommons.org/licenses/by-nc/3.0     698,617
http://arctosdb.org/home/data/; https://creativecommons.org/licenses/by-nc-sa/3.0   35,885
http://arctosdb.org/home/data/; https://creativecommons.org/licenses/by/3.0          6,700
http://mvz.berkeley.edu/mvzdata_terms; https://creativecommons.org/licenses/by/3.0     579
http://arctosdb.org/home/data/; https://creativecommons.org/publicdomain/zero/1.0       20
```

Spec 01 maps it as a scalar `keyword`. Give it the same `.split` subfield as taxonomy (D23) so the CC term is matchable on its own. The CSV export (spec 05) can keep the joined string — it is the licence statement verbatim, and that is what should travel with the data.

### 7. `related_record_cache.record` comes in three forms

Of 170,984 relation rows:

| Form | Rows | Example |
|---|---:|---|
| Full URL | 142,242 (83.2%) | `https://arctos.database.museum/guid/MSB:Mamm:293371` |
| Bare GUID | 5,886 (3.4%) | `MSB:Mamm:293371` |
| Not a GUID | 22,856 (13.4%) | `A4HEG`, `NK 200451`, `AMNH M 263798`, `M-263798`, `318688`, `MIG12-28536513` |

191 of the URLs are `http://`, not `https://`. One value is itself `; `-joined (`M-261738; MSB:…`).

The ETL must normalise the first two forms to a bare GUID for `related_guid`, and record the third as unresolvable with `unresolved_reason`. Spec 01 mentions `unresolved_reason` but says nothing about normalisation; it needs to.

13.4% unresolvable is better than the 27% the small sample suggested — still worth publishing in the UI rather than silently answering for 87% of the graph.

### 8. Only 7 columns are empty corpus-wide, not 24 (OQ15)

Spec 07 lists 24 columns empty across its 199 rows and warns not to trust it. Correctly — 17 of them are populated at scale. Genuinely empty across all 741,801 rows:

```
continent_ocean   culture_of_origin   culture_of_use   encumbrances
infraspecific_rank   lastpartlocation   member
```

`sea`, `associated_species`, `subtribe`, `collecting_event_name`, `creator`, `subject`, `materials`, `copyright_holder`, `formation`, `scientificnameid`, `doi`, `public_accn_id`, `media_tags`, `kt`, `continent` are all populated somewhere. OQ15 closes for this slice — with the caveat that a non-MSB institution may populate the seven.

`encumbrances` empty across 741,801 rows is a real result: **D29 holds**, and the build-time assertion is cheap to keep.

## Confirmations — decisions the full slice upholds

| Decision | Evidence at 741,801 rows |
|---|---|
| **D22** value hierarchy | *(Since confirmed authoritatively — `ctexamined_detected` defines 32 values, max depth 2. See [09-code-tables.md](09-code-tables.md).)* Detection values observed here are **16 distinct values, max colon depth 2**. `ectoparasite: flea/mite/tick/louse/fly/mite or tick`, `virus: Orthohantavirus/SARS-CoV-2/Borealpox`, `fungi: Batrachochytrium dendrobatidis/Ophidiomyces`, plus bare `ectoparasite`, `endoparasite`, `parasite`, `pathology`, `PFAS`. The `path_hierarchy` tokenizer is exactly right and cannot over-expand |
| **D23** multi-valued taxonomy | Real at every rank. `suborder` 2,063 · `genus` 1,938 · `phylclass` 1,951 · `species` 1,912 · `family` 1,641 · `subfamily` 1,207 rows. ~0.26% per rank, not the 1.5% spec 07 estimated — but the failure is still silent |
| **D26** nested events | 14,734 records (1.99%) have more than one event; the largest has 19. Top-level date misses events on all of them |
| **D27** keep duplicates | Confirmed — `2` is by far the commonest multi-event count (11,832 records) |
| **D28** no-event records | 3,265 records (0.44%) have empty `json_locality`; 4,070 have no `began_date`. The synthesized-event case in spec 01 is real |
| **D29** encumbrances | Empty across all 741,801 rows |
| **D25** flat arrays from `attributedetail` | Vindicated: the top-level `detected` column is `; `-joined on 4,309 rows, `examined_for` on 18,048. Building from the JSON avoids all of that splitting |
| `attributedetail` shape | 2,488,094 attribute rows, **0 JSON parse errors**, all seven keys present on every row. 84 distinct `attribute_type` values; detection types total 236,544 rows |
| `related_record_cache` shape | 170,984 rows across 124,291 records (16.8%), 0 parse errors |
| Coordinates | 644,287 both · 97,514 neither · **0 partial**. Spec 01's "omit if either is blank" guard never fires, but costs nothing |
| `formatted_scientific_name` | Only `<i>` tags, no others. Differs from `scientific_name` on 211,194 records (28.5%) — it is not redundant, confirming the decision to keep it `"index": false` with an `<i>`-only allowlist |

## New issues found

### `attribute_value.hierarchy` will index junk for non-detection types

The `path_hierarchy` tokenizer is applied to `attributedetail.attribute_value` for *all* 84 attribute types, not just the four detection ones. Detection values top out at depth 2. Others do not:

```
reproductive data | "testes position: abdominal | testes length: 1 mm | testes width: 1 mm"
reproductive data | "vagina: open | nipples: enlarged | lactating: no | pregnant: yes"
colors            | "Irides:red, yellow eye ring; tarsus/tes/pads:orange"
```

Depths of 3–12 occur on ~94,000 attribute rows, producing ancestor tokens like `testes position` and `Irides:red, yellow eye ring`.

Not a correctness bug — nothing queries those, and the flat `detected`/`examined_for`/`not_detected`/`not_examined_for` fields carry only clean detection values. It is index bloat, and it means `attributedetail.attribute_value.hierarchy` must never be used as an aggregation source. Spec 03 already aggregates the flat fields instead, so this is a note, not a change.

### `event_count` is unreliable in both directions

3,772 records (0.51%) disagree with `len(json_locality)`. Mostly `event_count` too high (`2|1` on 3,392 records), but `1|2` occurs 41 times and `2|3` 67 times — so it is not simply an over-count. OQ14's answer is "do not use it for validation", which spec 01 already says. The open question of *why* is still worth asking upstream, but nothing in the build depends on it.

### `taxon_rank` is empty on 23.5% of records

174,365 of 741,801. Populated: `species` 475,319, `subspecies` 72,336, `genus` 17,527, `family` 2,118, then a long tail. Anything in the UI keyed on `taxon_rank` must handle absence as the normal case.

### `taxa_formula` has more shapes than the sample showed

`A` 734,149 · `A {string}` 5,321 · `A cf.` 775 · `A x B` 710 · `A or B` 657 · `A ?` 132 · `A / B intergrade` 40 · `A ssp.` 13 · `A and B` 4. Only relevant as display context for multi-valued taxonomy; spec 07 already establishes it cannot predict which records need splitting.

### The corpus is not one institution

74 `guid_prefix` values, 30 institutions. `MSB:Mamm` 355,691 · `MSB:Fish` 126,206 · `MSB:Herp` 106,348 · `MSB:Para` 53,046 · `MSB:Bird` 50,631 · `MSB:Host` 25,708, then `NMMNH`, `KSB`, `UAM`, `DGR`, `NMU`, `HWML`, `UWBM` and 60 more.

Spec 06 worried that cross-institution relation targets would fail to resolve in an MSB-scoped dump. In this slice they largely do resolve, because the slice was built by following the relations. Whether that holds for the production dump depends on how it is scoped — worth confirming, and it is the one place where widening the dump beats writing code.

## `locality_search_terms` at scale

Populated on 738,536 records (99.6%), and large: 110,580 records carry 30 or more comma-joined terms. It is the right primary place field (D24), and the case for requesting it as an array (OQ12) is stronger at this size — splitting a 30-term joined string whose terms contain commas is not recoverable.
