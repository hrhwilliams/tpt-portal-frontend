# Spec 11 — Requests for whoever generates the dump

Four asks, in priority order. Each states what breaks without it, with counts from a 741,801-row slice (`msb.csv`) and example GUIDs so they can be checked directly.

None of these are data-quality complaints. Three are format requests and one is a scoping question. Everything else in the portal works with the dump exactly as it is.

---

## Request 1 — `locality_search_terms` as a JSON array (was OQ12)

**Ask:** emit `locality_search_terms` as a JSON array, the way `json_locality`, `attributedetail`, and `collector_agents` already are.

**Current form:** terms joined on `", "`.

**Why it cannot be split back:** individual terms contain commas.

```
"United States, New Mexico, San Juan County"     <- one term
"Isle Royale National Park"                      <- one term
```

Splitting the joined string on `", "` turns the first into three fragments, none of which is a real place name. There is no delimiter that works.

**Scale:** populated on 738,536 of 741,801 records (99.6%). 110,580 records carry 30 or more terms.

**What breaks without it:** this is the portal's primary place field — neither flagship query's place name appears in `spec_locality`, and both appear here verbatim. Without the array we fall back to `text` + `match_phrase`, which loses exact matching and makes place-name suggestions impossible. Place is the least forgiving input on the form; guessing at exact spelling with no suggestions is where users will give up.

**Effort guess:** low. The array almost certainly exists before it is joined.

---

## Request 2 — Confirm how the dump is scoped (was OQ16)

**Ask:** is the production dump restricted to one institution, or does it include the records that MSB specimens are related to?

**Why it matters:** `msb.csv` was built by grepping for `MSB`, so it contains the records at both ends of most relations and therefore resolves them _by construction_. That tells us nothing about production.

Relations point outward at 74 distinct `guid_prefix` values across 30 institutions:

```
host of parasite -> UAM:Ento   1,944      -> NMU:Para   938
                 -> HWML:Para    927      -> USNPC:Para 101
parasite of      -> UAM:Mamm  5,629      -> UWBM:Mamm  135
same individual as -> NMMNH:Mamm 5,793    -> KSB:Mamm 1,307   -> ANWC:Birds 364
```

**What breaks:** if production is MSB-only, those become dead ends and the v2 host/parasite feature answers for materially less of the graph than the 86.6% measured here. This is fixed by widening the dump, not by writing code — which is why it is worth asking before v2 is scheduled rather than after.

**Related:** `parasite of` (57,485) and `host of parasite` (54,059) differ by 3,426. The expectation is that these are edges leaving the slice. Confirming that would close it.

---

## Request 3 — Why does `event_count` disagree with `json_locality`? (was OQ14)

**Ask:** is `json_locality` filtered by event type, deduplicated, or truncated?

**Evidence:** 3,772 of 741,801 records (0.51%) disagree, in **both** directions:

| Shape                                 | Records |
| ------------------------------------- | ------- |
| `event_count = 2`, one entry supplied | 3,392   |
| `event_count = 3`, two supplied       | 257     |
| `event_count = 2`, **three** supplied | 67      |
| `event_count = 1`, two supplied       | 41      |

Examples: `MSB:Bird:49658`, `MSB:Herp:75023`, `MSB:Bird:49663`, `MSB:Bird:49630`.

For `MSB:Bird:49658` the missing event looks real — `locality_search_terms` mentions `Mexico, Chihuahua` and `Brewster County`, and neither appears in its single supplied event or its `higher_geog`.

**What breaks:** nothing, immediately. The ETL builds events from the array and ignores the count. But all date and place filtering runs through those events, so if `json_locality` is systematically dropping events, the portal has a small silent recall ceiling it currently describes as 0.5% without knowing whether that is the true figure.

**Lowest-effort answer that helps:** even "it's filtered to collection events" would close this.

---

## Request 4 — An extraction timestamp column (supports D41)

**Ask:** does the export already carry the timestamp of when it was extracted? If so, name the column.

**Why:** D2 makes staleness a design property, so the UI shows "Data current as of …". D41 has the ETL write that into an index metadata document. The ETL knows when it _ran_, which is not when the data was _extracted_ — those differ by however long the file sat in a queue.

**What breaks without it:** nothing serious; we report the ETL run date and it is approximately right. Worth one line in a reply.

---

## Not requests

Recorded so they are not mistaken for asks:

- **Partial dates** (`1994`, `1994-06`, `2015-08-13T20:46`) are fine. Elasticsearch parses all of them with a `format` list. 656 collecting dates and 11,758 attribute dates are affected and none of them are malformed. **Do not "fix" these upstream** — a year-only date is real information and coercing it to a full date would fabricate precision.
- **`; `-joined multi-valued taxonomy** (`"Arvicolinae; Arvicolinae"`, `"Echinostomata; Digenea"`) is handled by an analyzer. No change needed.
- **`; `-joined detection columns** are not used — those arrays are built from `attributedetail` instead.
- **`encumbrances`** is empty across all 741,801 rows, which is correct and the ETL asserts it stays that way.
- **`use_license_url` carrying two joined URLs** is fine and is handled.
