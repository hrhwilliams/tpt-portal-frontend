# Spec 09 — Arctos code tables as the vocabulary source

Arctos exposes its controlled vocabularies, with documentation, at
`https://arctos.database.museum/component/api/v2/authority.cfc?method=code_tables`.
121 tables. Fetch with `tools/fetch_code_tables.py`; the API key is IP-bound and lives in `ARCTOS_API_KEY`, not in the repo.

This changes where `/api/schema` gets its vocabularies, and it adds one mandatory safety filter.

## The structural find: vocabularies are machine-declared

`ctattribute_type` documents all 145 attribute types with three fields that decide how the portal treats each one:

| Field              | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `value_code_table` | name of the table constraining the value, or empty   |
| `unit_code_table`  | name of the units table — i.e. this is a measurement |
| `public`           | `0` means **do not show outside Arctos**             |

So "which fields have a restricted vocabulary" is a lookup, not a judgment call. Against the 84 attribute types observed in `msb.csv`:

- **23 types have a `value_code_table`.** The queryable ones: `detected`, `not detected`, `examined for`, `not examined for` (all → `ctexamined_detected`), `sex` → `ctsex_cde`, `life stage` → `ctlife_stage`, `location in host` and `parts examined` → `ctlocation_in_host`, `experimental` → `ctyes_no`, `processing history`, `mortality cause`, `caste`.
- **39 observed types are measurements** — no value table, a `unit_code_table` instead (`weight`, `total length`, `tail length`, …). No vocabulary, correctly.
- **33 observed types are free text** — neither table. `reproductive data`, `colors`, `stomach contents`, `verbatim host ID`, `molt condition`, `fat deposition`, `age`.

Every attribute type present in the data is documented. Nothing observed is undocumented.

## D35 — Non-public attribute types must never be indexed

Three types carry `public: 0`:

| Type              | Arctos' own description                                              |
| ----------------- | -------------------------------------------------------------------- |
| `NAGPRA category` | _"Insufficient documentation DO NOT USE"_                            |
| `restricted data` | _"Internal information of any sort. Do not change privacy setting!"_ |
| `value`           | Monetary value                                                       |

None appear in `msb.csv` — all three are zero across 2,488,094 attribute rows, and all three are recommended for Cultural collections, which are out of scope. **That is exactly why this needs to be enforced rather than observed**, and it is the same hazard as D29's encumbrance assertion: a public, unauthenticated portal (D15) must not start leaking because an upstream collection changed.

The ETL filters `attributedetail` against the fetched `ctattribute_type`, dropping any row whose type is `public: 0`, and fails the build if it encounters a type the code table does not document at all. Cheap, and it is the difference between "we checked" and "it happened not to be there".

## D36 — `/api/schema` sources vocabularies from the code tables, not from aggregations

Spec 03 currently builds `analysis_values` from a `terms` aggregation over the index. Replace it. Aggregations have two defects the code tables do not:

1. **They only return values that are present.** A controlled value with no records yet silently vanishes from the dropdown, so the form's options quietly change between snapshots.
2. **They cost a scan** across >10M documents, repeated on every refresh.

The code table gives the complete list plus a human description per value, from the authority that defines them.

Keep one aggregation, for a different purpose: a `terms` agg on the bare keyword field to get **counts**, so the form can mark values that currently have no records rather than dropping them. "0 records" is information; a missing option is not.

## The detection vocabulary in full (`ctexamined_detected`)

**32 controlled values**, shared by all four detection types — `detected`, `not detected`, `examined for`, and `not examined for` all point at this one table. 16 occur in `msb.csv`; the other 16 are valid and may appear in any snapshot.

```
DNA                      arsenic                  isotopic signature       toxin
PFAS *                   microbiome               pathology *              pathology: skeletal
bacteria                 bacteria: Francisella tularensis
ectoparasite *           ectoparasite: flea *     ectoparasite: fly *      ectoparasite: louse *
ectoparasite: mite *     ectoparasite: tick *     ectoparasite: mite or tick *
endoparasite *           endoparasite: acanthocephalan   endoparasite: cestode
endoparasite: nematode   endoparasite: trematode
fungi                    fungi: Batrachochytrium dendrobatidis *   fungi: Coccidioides
fungi: Ophidiomyces *    parasite *
virus                    virus: Borealpox *       virus: Orthohantavirus *
virus: Rabies            virus: SARS-CoV-2 *
```

`*` = observed in `msb.csv`.

Three things follow:

**Maximum colon depth is 2, by design.** D22's `path_hierarchy` tokenizer is now backed by the authority definition rather than by observation — no value in this table can over-expand. The parent terms (`bacteria`, `virus`, `fungi`, `ectoparasite`, `endoparasite`, `pathology`) are deliberate: the table's own guidance is _"Use a more specific term if known."_ The hierarchy is intentional, which is what makes ancestor expansion the correct reading of the data rather than a convenience.

**`endoparasite: cestode` is a controlled value**, which matters for flagship query 1 (_Taeniid cestodes_). That query is now answerable two ways — via the attribute path (`examined for`/`detected` = `endoparasite: cestode`) and via the relations path (`related_family: Taeniidae`). They are different assertions and will not return the same set: the attribute records _that a cestode was found_, the relation records _which catalogued parasite it was_. Both are legitimate; the form should not blur them.

**Descriptions are worth surfacing.** Each value carries a definition (`"Ticks are parasitic arachnids in the order Ixodida"`), plus `issue_url` and `documentation_url`. Put the description in the option's `title`, and the ambiguity in terms like `parasite` versus `endoparasite` stops being the user's problem.

### Arctos' own caveat belongs in the UI

The table's metadata says, verbatim:

> Examined/Detected data are primarily useful in organizing, summarizing, and discovering additional evidence… This node is **not** capable of carrying evidence; these data **cannot** be Research Grade by themselves. These data (when possible) should be accompanied by parts with specific attributes, relationships to other cataloged items, or other forms of direct evidence of the assertions made here.

D21 and spec 04's honesty note were reasoned from the data. This is the same conclusion from the authority that defines the field, and it is better cited than paraphrased. Link `https://handbook.arctosdb.org/best_practices/examined.html` next to the outcome radio group.

## Other tables the specs can use

| Table                                     | Values  | Use                                                                                                                                                                    |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctlicense`                               | 8       | Maps the CC URL in `use_license_url` to a short label — `CC BY-NC`, `CC0`, `Copyright Restricted`. Spec 05 renders the label and exports the URL                       |
| `ctlocation_in_host`                      | 77      | `location in host` (33,226 rows) and `parts examined` (1,491). A real parasitology filter, cheap, post-v1                                                              |
| `ctcollector_role`                        | 6       | `collector`, `preparator`, `creator`, `isolator`, `subject`, `copyright holder`. Confirms D01's role filter needs an explicit allowlist — there are six roles, not two |
| `ctsex_cde`                               | 7       | Includes `male ?`, `female ?`, `gynandromorph`. A boolean sex filter would be wrong                                                                                    |
| `ctlife_stage`                            | 13      |                                                                                                                                                                        |
| `cttaxa_formula`                          | 10      | Matches the 9 observed exactly                                                                                                                                         |
| `ctspecimen_event_type`                   | 7       | `collection`, `encounter`, `observation`, `creation`, `depiction`, `use`                                                                                               |
| `ctcollecting_source`                     | 3       | `wild`, `captive`, `unknown`. **Worth surfacing** — a captive-bred specimen's locality does not mean what a wild one's does                                            |
| `ctverificationstatus`                    | 3       | `accepted`, `unaccepted`, `verified and locked` — per event, added to the mapping in spec 01                                                                           |
| `ctspecimen_part_name`                    | 405     | For the v2 part filters (spec 06)                                                                                                                                      |
| `ctpart_preservation` / `ctpart_modifier` | 91 each |                                                                                                                                                                        |

## What the code tables do _not_ cover

**Specimen relationships.** `cttaxon_relation` sounds relevant but is not — it holds `synonym of`, `misspelling`, `potential alternate spelling`, which are _taxon name_ relationships. No table in the API describes `parasite of` / `host of parasite` / `same individual as`. The 16 relationship types in spec 08 remain empirically derived, and a new type could appear in any snapshot without warning. Log unknown relationship values; do not reject them.

**`attribute_method`.** Confirmed prose. No code table, consistent with D11 — free text, no dropdown.

## The line this must not cross

The code tables are for **labelling, ordering, and documenting** what is in the index, plus the one `public: 0` exclusion, which is a privacy control rather than a data judgment.

They are **not** a validation filter. If a record carries a value the code table doesn't list, index it and log the mismatch. Rejecting records to make the data conform to its own documentation is sanitizing, not searching — the portal's job is to find what is there, including the parts that are untidy.
