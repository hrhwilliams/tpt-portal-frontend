# tools

Profiling scripts and the fixture generator. Everything here is reproducible from
a snapshot; nothing here runs at request time.

## What depends on what

```
docs/data/code-tables/*.json ──┐
                               ├──> build_fixtures.py ──> src/lib/fixtures/{schema,taxa}.json
docs/data/profiles/*.json ─────┤
docs/data/dataset/test.csv ────┘
docs/data/dataset/msb.csv ──> profile_*.py ──> docs/data/profiles/*.json
```

**The profiles are committed, so the fixtures rebuild without `msb.csv`.** That
file is 7.2 GB and is not in the repo. Only re-run the profilers when a new
snapshot arrives.

## Commands

| Command                       | Needs `msb.csv` | Writes                                      |
| ----------------------------- | --------------- | ------------------------------------------- |
| `npm run fixtures`            | no              | `src/lib/fixtures/schema.json`, `taxa.json` |
| `npm run profile:collections` | **yes**         | `docs/data/profiles/prefix_sciname.json`    |
| `npm run profile:detection`   | **yes**         | `docs/data/profiles/detection_matrix.json`  |

Run `npm run fixtures` after any profiler.

## The scripts

| Script                                                 | What it answers                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_fixtures.py`                                    | Turns the Arctos code tables into a `GET /api/schema` response and the sample slice into a `GET /api/taxa` index. Drops the three `public: 0` attribute types, and derives each attribute type's value dropdown from its declared `value_code_table` |
| `profile_detection_matrix.py`                          | Occupancy of the (examined for, not examined for, detected, not detected) matrix per (specimen, value) pair, both exact and hierarchy-aware. Evidence for how the attribute block is shaped                                                          |
| `profile_prefix_sciname.py`                            | Distinct `guid_prefix` and `scientific_name` values with record counts. Feeds the collection multi-select and binomial autocomplete                                                                                                                  |
| `profile_dump.py`, `profile_msb.py`, `profile_msb2.py` | The original column-level profiling behind specs 07 and 08. The last two stream in chunks and handle the full dump                                                                                                                                   |
| `fetch_code_tables.py`                                 | Refreshes `docs/data/code-tables/` from the Arctos authority API. Needs `ARCTOS_API_KEY`; the key is IP-bound and is never committed                                                                                                                 |

## Notes

Query translation now lives in the Rust service, which owns the golden-file suite
for it. `build_fixtures.py` still stands in for `/api/schema`, and goes away when
that endpoint is wired up too.
