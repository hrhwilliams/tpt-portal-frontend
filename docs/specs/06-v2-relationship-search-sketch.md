# Spec 06 (sketch) — v2 relationship / host-parasite search

Query UI deferred to v2 (D7); **the mapping lands in v1** (D31) because reindexing >10M documents later is expensive.

Revised twice: against `test.csv` ([07](07-data-validation.md)), then against the full 741,801-row MSB slice ([08](08-full-dump-validation.md)). The second revision **deleted most of the ETL this spec originally specified** — the data already contains what it proposed to derive.

Target query: _"What Arvicolid rodents from Saint Lawrence Island collected by Robert L. Rausch are hosts of Taeniid cestodes (including Echinococcus)?"_

The dump contains this query almost exactly: `MSB:Para:16970` and `MSB:Para:16839` are both _Echinococcus multilocularis_ (family Taeniidae), each `parasite of` an Arvicolinae host in Alaska. And `Saint Lawrence Island` appears verbatim in `locality_search_terms` on 6 of 199 sampled records. It is answerable.

## Corrections from the data

**1. "Arvicolidae" is `subfamily = Arvicolinae`.** No such family exists in this taxonomy source; the hosts sit in `family = Cricetidae`. The rank is off by one in the original request — worth telling the interviewee. _(Holds at 741,801 rows.)_

**2. ~~Edges are one-directional.~~ Withdrawn.** The 199-row sample had no `host of` edge, so this spec required the ETL to synthesize one. The full slice has **54,059 `host of parasite` edges**, sitting on the host records (`MSB:Mamm` 27,100 · `MSB:Host` 18,831 · `UAM:Mamm` 6,798) and pointing back at `MSB:Para`. The relationship is named `host of parasite`, which is why a grep for `host of` on the sample found nothing. Query it directly.

**3. ~~`MSB:Host` stubs make it two hops.~~ Withdrawn.** All 25,708 `MSB:Host` records carry `scientific_name`; 99.9% carry `collector_agents`, 99.98% `began_date` and `locality_search_terms`, 97.6% `genus`. They are complete host records. Only **3.4%** have a `same individual as` edge at all. "Collected by Rausch" is evaluable on the `MSB:Host` record itself.

Both withdrawals are evidenced in [08-full-dump-validation.md](08-full-dump-validation.md) and recorded as D31.

## Why this needs a mapping change, not a clever query

`relatedcatalogeditems` is a `; `-joined display string of the form `(relationship) identifier_type value`. It parses, but **don't parse it** — `related_record_cache` is the same data as JSON, across all 170,984 relation rows with zero parse errors.

The remaining reason for a mapping change is narrower than this spec originally claimed: Elasticsearch cannot join at query time, so the relationship and the related record's family must sit together in one nested doc. The cache supplies both. That is now the whole job.

**Related taxonomy below family is deferred (D32).** The cache carries `family` plus a loose `identification` string (`"Microtus oeconomus cf."`, `"Stagnicola"`, `"Cestoda"` — qualifiers, genus-only, and higher taxa). Resolving genus/order/subfamily of the _related_ record needs the two-pass join below. Neither flagship query needs it — both filter the related record at family (`Taeniidae`). Build it when someone asks for a non-family related rank, not before.

## Mapping

The `relations` nested field is specified in [01-index-mapping.md](01-index-mapping.md) and built in v1. Collector search uses `collector_ids` from the same spec — matching on the Arctos agent URL, not the name, which is what makes "Robert L. Rausch" survive spelling variants.

## The query then becomes one request

```json
{
	"bool": {
		"filter": [
			{ "term": { "subfamily": "Arvicolinae" } },
			{ "term": { "collector_ids": "https://arctos.database.museum/agent/…" } },
			{
				"nested": {
					"path": "events",
					"query": {
						"term": { "events.locality_search_terms": "Saint Lawrence Island" }
					}
				}
			},
			{
				"nested": {
					"path": "relations",
					"query": {
						"bool": {
							"filter": [
								{ "term": { "relations.relationship": "host of parasite" } },
								{ "term": { "relations.related_family": "Taeniidae" } }
							]
						}
					}
				}
			}
		]
	}
}
```

**Denormalizing the full classification is what makes "all taxonomic levels below family" work.** `related_family: Taeniidae` matches every Taeniid genus and species — including _Echinococcus_ — with no rank expansion, no recursive lookup, no taxonomy service at query time. The same trick handles pathogen taxonomies if viral, bacterial, or fungal sources are imported into Arctos.

Same correlated-nested rule as spec 02: relationship type and related taxonomy in **one** `nested` clause, or you match a specimen that hosts something and is separately related to a Taeniid.

## ETL: one pass, and much less of it than this spec first said

For each record's `related_record_cache` entries, write one `relations` nested doc: copy `relationship`, `family`, `identification`, `geography`, and normalise `record` to a bare GUID. That is all.

Details that still decide whether this works:

- **Normalise `record`.** 83.2% are full URLs (191 of them `http://`), 3.4% are bare GUIDs, and 13.4% are not GUIDs at all — barcodes (`A4HEG`), `NK` numbers, foreign identifiers (`AMNH M 263798`), and bare integers. Match on the path segment, not a fixed prefix.
- **13.4% of relations are dead ends** — down from the 27% the small sample suggested. Record `unresolved_reason` and **publish the rate**. A feature that silently answers for seven-eighths of the graph is worse than one that says so.
- **Cross-institution targets.** Edges point at `UAM:Ento` (1,944 for `host of parasite` alone), `NMU:Para`, `HWML:Para`, `USNPC:Para`, `ANWC:Birds`, and 60 more prefixes. `msb.csv` resolves them because it was built by following relations; a strictly MSB-scoped production dump would not. **Measure before promising the feature** — it is fixed by widening the dump, not by better code.
- **The `parasite of` / `host of parasite` counts differ by 3,426** (57,485 vs 54,059). Almost certainly edges leaving the slice. Measure it; do not synthesize into the gap — that would reintroduce exactly the invented data D31 removed.
- **Nested doc counts multiply shard cost.** 170,984 relation rows across 124,291 records here. Measure at >10M documents before committing.

### Deferred: the two-pass classification join (D32)

If a non-family related rank is ever needed: pass 1 builds `guid → classification` for every record; pass 2 resolves each relation's target against it and denormalizes the full chain into `related_genus`, `related_phylorder`, and so on. Then `related_family: Taeniidae` generalises to any rank with no query-time lookup.

Not built in v1 or v2. It doubles the ETL's memory profile for a capability nothing has asked for.

## Relationship vocabulary — full slice

170,984 relation rows across 124,291 records (16.8%), 16 relationship types:

```
parasite of 57,485   host of parasite 54,059   same individual as 40,442
collected with 7,865   same lot as 3,602   parent of 3,450   offspring of 3,284
sibling of 686   associated with 48   eaten by 18   ate 15   in amplexus with 14
littermate or nestmate of 10   same series as 2   mate of 2   same edition as 2
```

Inverses are stored natively in every case where one exists. `host of parasite` is the name the sample was missing — D31.

**There is no code table for this.** The Arctos authority API exposes 121 tables and none of them describes specimen relationships; `cttaxon_relation` sounds right but holds `synonym of` / `misspelling` / `potential alternate spelling`, which are taxon _name_ relationships (spec 09). So unlike the detection vocabulary, this list is empirical and a new type can appear in any snapshot without warning. Log unknown relationship values and index them; do not reject them (D37).

### The cestode query has two distinct answers

`endoparasite: cestode` is a controlled `ctexamined_detected` value, so flagship query 1 is expressible **without** the relations field at all — as an attribute search. That is not the same question:

| Path                                                | Asserts                                                 |
| --------------------------------------------------- | ------------------------------------------------------- |
| `examined for`/`detected` = `endoparasite: cestode` | a cestode was found in this host                        |
| `relations.related_family = Taeniidae`              | a _catalogued_ parasite specimen is linked to this host |

The second is a strictly stronger claim and will return fewer records. Both are legitimate; the v2 UI must not present them as interchangeable.

## Also in v2, not v1

- Relationship query UI (the mapping and ETL are v1)
- Taxon autocomplete
- Part-based filters (`partdetail.part_attributes` supports "has a frozen liver")
- Facets and map (D14)
