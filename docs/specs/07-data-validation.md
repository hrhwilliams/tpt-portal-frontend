# Spec 07 — Data validation against `test.csv`

> **Superseded in part.** [08-full-dump-validation.md](08-full-dump-validation.md) profiles 741,801 rows and overturns several conclusions here — most importantly the "Relationship direction" section below, which is **wrong**: `host of parasite` exists (54,059 rows) and `MSB:Host` records are complete specimens, not stubs. Also corrected: "100% clean ISO" dates, the empty-column list, and the ~27% unresolvable-relation rate. Where the two disagree, spec 08 wins. This spec is kept as the record of what the small sample supported.

Sample: 199 rows × 154 columns, 2.0 MB. Institutions MSB (194), NMMNHS (3), DGR (1), UWBM (1). Collections MSB:Mamm 101, MSB:Herp 36, MSB:Fish 25, MSB:Para 16, MSB:Bird 12, MSB:Host 4.

Small sample — vocabulary lists here are indicative, not complete. Everything about _structure_ is reliable.

## Verdicts on interview decisions

| Decision                                 | Verdict                                | What the data says                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D8 positives only                        | **revise, but not to a binary**        | `not detected` and `not examined for` are real types, but outcome recording is unreliable in both directions. See below                                                                               |
| D9 date = collection date                | **right, for a different reason**      | `attribute_date` is clean ISO but is often the _load_ date. One record's own remark: _"Legacy samples screened between 2000-2022… Attribute date reflects loaded date only."_ Unusable as a test date |
| D10 locality = free-text `spec_locality` | **overturned**                         | `locality_search_terms` contains the interview place names verbatim. `spec_locality` does not                                                                                                         |
| D11 method in remark                     | **corrected**                          | `attribute_method` is a first-class field (120/731 non-null), separate from `attribute_remark`                                                                                                        |
| D12 ranks phylum→species                 | **incomplete**                         | Arvicolidae is not a family here — it is `subfamily = Arvicolinae` inside `family = Cricetidae`. Subfamily is mandatory                                                                               |
| D18 correlated nested                    | **confirmed**                          | Method/date/determiner vary per attribute row on the same specimen. Correlation is required                                                                                                           |
| D7 relationships are v2                  | **confirmed, and harder than assumed** | See "Relationship direction" below                                                                                                                                                                    |

## `attributedetail` — actual structure

Seven fields per row, not two. 731 rows across 170 specimens:

| Field                  | Non-null | Notes                                                             |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| `attribute_type`       | 731/731  | 35 distinct types in sample                                       |
| `attribute_value`      | 731/731  |                                                                   |
| `attribute_determiner` | 725/731  | agent name string                                                 |
| `attribute_date`       | 700/731  | **100% clean ISO `YYYY-MM-DD`** — no partial dates in this sample |
| `attribute_units`      | 281/731  | mm, g, individuals, years, kg                                     |
| `attribute_method`     | 120/731  |                                                                   |
| `attribute_remark`     | 120/731  |                                                                   |

Types are dominated by measurements (`sex` 134, `reproductive data` 61, `weight` 58, `life stage` 53, `hind foot with claw` 49…). The four detection types total 96 rows: `examined for` 40, `not detected` 30, `detected` 14, `not examined for` 12.

## Detection semantics — four states, and the pairing is not string equality

### Values are hierarchical, colon-delimited

Complete set across all four detection types in the sample:

```
ectoparasite          ectoparasite: flea      ectoparasite: louse
endoparasite          parasite                virus: Orthohantavirus
```

`ectoparasite: flea` is a **child** of `ectoparasite`. This is the crux of the whole feature.

### The pairing problem, demonstrated

`MSB:Mamm:348964` carries:

```
examined for : ectoparasite
detected     : ectoparasite: flea
detected     : ectoparasite: louse
```

Naive pairing on equal `attribute_value` concludes "examined for ectoparasite, outcome unknown." The truth is two positives, recorded at finer granularity than the examination. **Outcome matching must be prefix/hierarchy-aware on the colon-delimited value**, not `==`.

Conversely, 2 of 14 `detected` rows in the sample have **no** `examined for` row for any related value. So `examined for` is not a reliable denominator either — a specimen can be positive without ever being recorded as examined.

### Distribution over (specimen, value) pairs

| Combination                                   | Count |
| --------------------------------------------- | ----- |
| `examined for` + `not detected`               | 27    |
| `examined for` + `detected`                   | 12    |
| `not examined for` only                       | 12    |
| `detected` only, no `examined for`            | 2     |
| `examined for` only, no outcome at that value | 1     |

The single "no outcome" case is the `348964` record above, which does have outcomes at child values — so after hierarchy-aware matching this sample has zero true orphans. **You have confirmed true orphans do occur in the full corpus**, so the state must be modelled regardless. Neither `detected` + `not detected` nor `examined for` alone is a complete partition.

### The four states the UI must distinguish

| State                     | Derivation                                                              | Honest label                 |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Positive                  | `detected` at the value or any child of it                              | Detected                     |
| Negative                  | `not detected`, and no `detected` at the value or below                 | Not detected                 |
| Tested, result unrecorded | `examined for`, with no `detected`/`not detected` at the value or below | Examined, no result recorded |
| Not tested                | `not examined for`, or nothing at all                                   | Not examined / no record     |

Two rules follow, and both are correctness rules, not polish:

1. **Absence is never negative.** "No `detected` row" spans genuine negatives, unrecorded results, and never-tested. Collapsing them into "negative" fabricates data.
2. **A positives-only tool cannot report prevalence.** "Which of these were positive" needs the denominator, and the denominator is incomplete. Whatever the UI shows, it has to make the third state visible rather than silently folding it into one of the other two.

### `attribute_method` is prose, not vocabulary

Sample values: `comb`, `combed`, `comb with chloroform`, `comb w/chloroform`, `chloroform/brush and pick with forceps`, `brush`, `dissection`, `GI examined for helminths`, `external and/or internal examination`, and

> `Immunoglobulin G (IgG) serology screening using strip immunoblot for SNV (following method in https://arctos.database.museum/publication/10011855).`

A method dropdown is not achievable. This must be a free-text "method contains" input, and the UI has to say so — four spellings of "comb" in a 199-row sample means recall will be imperfect no matter what.

Also note `attribute_method` doubles as a provenance note in places: `Migrated from SNV results.`, `Originally entered to bulkloader by determiner on date…`. Not all values are methods.

## Pre-flattened detection columns — a cheap fast path

Top-level columns `detected`, `examined_for`, `not_detected`, `not_examined_for` hold `; `-joined values:

```
detected      = "ectoparasite: flea; ectoparasite: louse"
not_detected  = "virus: Orthohantavirus; virus: Orthohantavirus"   ← duplicated, one per source row
```

Split on `; ` and dedupe → four `keyword` arrays. A non-nested `term` filter is dramatically cheaper than a `nested` query at >10M docs, and it answers every query that doesn't need method/date/determiner correlation. Recommend indexing **both**: flat arrays for the common case, nested for correlated queries. Backend picks based on whether the request carries a method.

Hierarchy still applies — a flat-array query for `ectoparasite` must use `prefix`, or the ETL must expand children into ancestor terms at index time (index `ectoparasite: flea` as both itself and `ectoparasite`). Expansion at index time is the cheaper of the two at query scale.

## Taxonomy

Ranks present as columns: `kingdom`, `phylum`, `phylclass`, `superorder`, `phylorder`, `suborder`, `superfamily`, `family`, `subfamily`, `tribe`, `subtribe`, `genus`, `species`, `subspecies`. Note the names — `phylclass` and `phylorder`, not `class`/`order`. Plus `full_taxon_name` (the comma-joined chain), `taxon_rank` (empty 57/199, and empty for **every** MSB:Para record), `taxa_formula`, `scientific_name`, `formatted_scientific_name` (contains `<i>` HTML — escape or strip, never render raw).

### Arvicolidae → Arvicolinae

The interview asks to "search across Arvicolidae". No such family exists in this taxonomy source. 19 records carry `subfamily = Arvicolinae`, inside `family = Cricetidae`:

```
Animalia, Chordata, Mammalia, Rodentia, Myomorpha, Cricetidae, Arvicolinae, Microtus, Microtus ochrogaster
```

Without subfamily in the rank list, the flagship query cannot be expressed. Worth telling the interviewee their rank was off by one.

### Taxonomy columns are multi-valued

Taxonomy columns can hold **several values joined by `; `**:

```
subfamily = "Arvicolinae; Arvicolinae"        MSB:Mamm:138641, taxa_formula "A x B"
species   = "Acris blanchardi; Acris crepitans"  MSB:Herp:107575, taxa_formula "A or B"
suborder  = "Echinostomata; Digenea"          MSB:Para:19589,  taxa_formula "A"
```

The first two are multi-taxon identifications, flagged by `taxa_formula` (`A x B` hybrid, `A or B` uncertain). **The third is not** — `MSB:Para:19589` is a single taxon whose `suborder` carries two competing values, and `taxa_formula` gives no warning. So `taxa_formula` cannot be used to predict which records need splitting; every taxonomy value must be treated as potentially multi-valued.

A `term` query on `subfamily: "Arvicolinae"` **misses that record entirely.** Fixed by a `pattern` tokenizer on `;` (D23), querying `subfamily.split`. This is the most likely silent-wrong-answer bug in the pipeline: it affects ~1.5% of records, always returns fewer results rather than erroring, and nobody notices.

Splitting must be on `;` only, not whitespace — `species` and `subspecies` values legitimately contain spaces (`"Fundulus zebrinus"`, `"Myodes gapperi gapperi"`).

## Locality — `locality_search_terms` is the answer

It is a comma-joined bag of every place name attached to the record: named features, quads, counties, state abbreviations, HUC codes, geocoder names, full hierarchy strings.

Place names found in a 199-row sample:

```
Saint Lawrence Island (6)          ← interview query 1, verbatim
Grand Canyon National Park (5)     Gates of the Arctic National Park and Preserve (3)
Dinosaur National Monument (6)     Sevilleta National Wildlife Refuge (3)
Big Bend National Park (4)         Noatak National Preserve (3)
Mesa Verde National Park (4)       Kodiak Island (5)
```

Both interview queries' place names live here and **neither is in `spec_locality`**. Compare `spec_locality` on the same records: `"Chowiet Island, Sutwik Island Quad"`, `"Del Rio; near"`.

One catch: it is joined on `", "` but individual terms themselves contain commas (`"United States, New Mexico, San Juan County"` is one term). Splitting on `", "` is therefore lossy. Index as `text` + `match_phrase` for v1; ask the ETL for the pre-join array to enable exact matching and place autocomplete (OQ12).

## Relationship direction — the big v2 finding

`relatedcatalogeditems` is a `; `-joined display string of the form `(relationship) identifier_type value`:

```
(parasite of) Arctos record GUID https://arctos.database.museum/guid/MSB:Mamm:293371
(collected with) barcode A4HEG
(same individual as) AMNH: American Museum of Natural History M-263798
```

It parses cleanly, but **don't parse it** — `related_record_cache` is the same data as JSON, aligned 1:1 in all 33 records that have relations:

```json
{
	"relationship": "parasite of",
	"family": "Cricetidae",
	"identification": "Microtus oeconomus cf.",
	"record": "https://arctos.database.museum/guid/MSB:Host:13914",
	"identifier_type": "Arctos record GUID",
	"geography": "United States, Alaska",
	"locality": "…",
	"issued_by": { "agentID": "…", "agent_name": "…" }
}
```

Relationship vocabulary (37 rows): `same individual as` 17, `parasite of` 14, `offspring of` 3, `collected with` 2, `parent of` 1.

### Four problems, in increasing severity

**1. Edges are one-directional.** `parasite of` appears **only on the parasite record**. There is no `host of` anywhere. All 14 occurrences are on `MSB:Para` records pointing outward:

```
MSB:Para:16970  Echinococcus multilocularis (Taeniidae) --parasite of--> MSB:Host:11437  Ondatra zibethicus (Cricetidae)
MSB:Para:16839  Echinococcus multilocularis (Taeniidae) --parasite of--> MSB:Host:13914  Microtus oeconomus (Cricetidae)
MSB:Para:26528  Catallagia dacenkoi (Ctenophthalmidae)  --parasite of--> UAM:Mamm:80418  Myodes rufocanus (Cricetidae)
```

The interview wants _hosts_ as the result rows. The data only supports querying from the _parasite_. Either the ETL synthesizes inverse `host of` edges onto host records, or the query runs parasite-side and the UI inverts the presentation.

Good news: this sample contains the interview query almost exactly — _Echinococcus multilocularis_, Taeniidae, parasitizing Arvicolinae hosts in Alaska. It is answerable.

**2. The cache carries only `family`.** No genus, order, class, or subfamily of the related record — and `identification` is an unreliable substitute: `"Microtus oeconomus cf."` (qualifier), `"Stagnicola"` (genus only), `"Cestoda"` (class), `"Acari"` (subclass), `"Ixodida"` (order). "All taxonomic levels below family" needs a real two-pass ETL join on the related GUID, exactly as spec 06 assumed. Confirmed necessary, not optional.

**3. `MSB:Host` stubs create a two-hop graph.** 6 of 14 `parasite of` edges point at `MSB:Host` records — thin stubs (`parts = "media"`) that then link `same individual as` to the real `MSB:Mamm` record holding the collector, locality, and full taxonomy:

```
MSB:Para:16970 --parasite of--> MSB:Host:11437 --same individual as--> MSB:Mamm:…
MSB:Host:17435 --same individual as--> MSB:Mamm:280489
```

So "Arvicolid rodents from Saint Lawrence Island **collected by Robert L. Rausch** that host Taeniids" may need Para → Host → Mamm before the collector is even visible. `related_record_cache` caches one hop.

**4. ~27% of relations are taxonomically dead.** 10 of 37 have null `family` and `identification` because the target is not a resolvable Arctos record: a barcode (`A4HEG`), an `NK` number, an AMNH identifier, or a GUID whose cache never populated. `identifier_type`: `Arctos record GUID` 30, `identifier` 3, `barcode` 1, `AMNH…` 1, `GAN` 1, `NK` 1.

## Collectors

`collectors` is a display string (`"Amber L. Hobbes, Keith B. Gido"` — comma-joined, and personal names can contain commas). `collector_agents` is the structured form:

```json
{
	"agentid": "https://arctos.database.museum/agent/21302424",
	"agent_name": "Amber L. Hobbes",
	"agent_role": "collector",
	"agent_order": 1
}
```

333 entries: 270 `collector`, 63 `preparator`. **Role filtering is required** — one sampled record's `collector_agents` holds only a preparator. Index `agentid` as keyword and match on it, not the name: that is what makes "Robert L. Rausch" robust against spelling variants. Note collectors are often institutions or projects, not people: `"Chile Hantavirus Project"`, `"Kobuk River Small Mammal Crew"`, `"Panama Hantavirus Project 2004"`.

## Events, dates, coordinates

- `began_date` / `ended_date`: 100% clean ISO in this sample. Safe as ES `date`.
- `event_count`: 1 for 193 records, 2 for 5, **0 for 1**. `locality_count` likewise.
- **`json_locality` is empty on 2 records, and one of them has a date.** `MSB:Bird:6062` reports `event_count = 1` and `began_date = 1985-02-07` with an empty `json_locality` and blank `higher_geog`/`spec_locality`. Under D26 that record has no nested event and would be unfindable by date — spec 01 synthesizes one from the top-level fields. `MSB:Herp:57260` has neither date nor place and correctly gets no event (D28).
- `event_count` disagrees with `len(json_locality)` on 3 of 199 records, in two distinct shapes: `event_count = 2` with one entry supplied (`MSB:Bird:49658`, `MSB:Herp:75023`), and `event_count = 1` with none (`MSB:Bird:6062`).
- Multi-event records break top-level dates. `MSB:Mamm:321142` has events on `2016-07-09` and `2016-08-12`, but top-level `began_date = ended_date = 2016-07-09`. **A range filter on the top-level date misses the second event.** Affects ~2.5% of records.
- `dec_lat`/`dec_long` on 171/199; omit `geo_point` when either is blank. `coordinateuncertaintyinmeters` on 136 — display it; an uncertainty-free coordinate invites false precision.
- `verbatim_date` is free text (`"30 Aug 2002"`, `"3 JUN 1949"`) — display only, never parse.

## Access and licensing

- `encumbrances` is empty in all 199 rows — but `enteredby = "Encumbered"` appears on the first record, so the mechanism is live in Arctos. A public unauthenticated portal (D15) must not republish encumbered localities. Needs confirmation that the dump already excludes or masks them (OQ11).
- `use_license_url` / `rights`: three licenses in the sample — CC BY-NC (most), CC BY-NC-SA, CC BY. Per-record, not per-portal. CSV export must carry the license column, and the portal cannot present the corpus under one blanket statement.

## Other filters the data supports cheaply

`guid_prefix` (9 values), `collection_cde` (Mammalogy, Herpetology, Ichthyology, Parasitology, Ornithology, Biological), `institution_acronym`, `cataloged_item_type`, `specimen_event_type` (collection 189, encounter 9), `has_tissues` (0–12, non-zero on 81/199), `sex`, `life_stage`, `collecting_method`, `typestatus` (8/199).

`partdetail.part_attributes` types: `preservation` 381, `storage temperature` 65, `part modifier` 27. Top parts: whole organism 94, liver 59, skull 57, skin 47, skeleton 33, muscle 25, blood 22. Supports "has a frozen liver" queries later — not v1.

## Columns empty in the entire sample

`continent_ocean`, `sea`, `associated_species`, `encumbrances`, `subtribe`, `infraspecific_rank`, `collecting_event_name`, `lastpartlocation`, `creator`, `subject`, `materials`, `copyright_holder`, `culture_of_origin`, `culture_of_use`, `formation`, `member`, `scientificnameid`, `doi`, `public_accn_id`, `media_tags`, `kt`, `continent`, `ocean`, `waterbody`.

Do not drop these on the strength of this sample — a 199-row draw from >10M can easily miss a sparsely-populated column.

## Reproducing this

Profiling scripts are in the session scratchpad; they read the CSV with `csv.field_size_limit(10**9)` (the JSON columns exceed the default) and `encoding="utf-8-sig"`. Worth committing them as `tools/profile_dump.py` so the same checks can run against each new snapshot — the multi-valued-taxonomy and detection-pairing issues are exactly the kind that reappear after a source change.
