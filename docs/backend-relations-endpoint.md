# `GET /api/relations`

The portal shows two independent tables: the Specimens a search matched, and the related
records reached from them. The second one cannot be built from `/api/search`, because
relations arrive inside records and a response carries one page of records.

Instead, we need a new endpoint that performs an inverse search to match all records
that are related to one of the GUIDs in the original query by one of the relationship
types requested, and possibly further filtered to some taxa. None of the other filters
that apply to the initial search, such as date, location, etc. apply to the related
records.

## Request

Identical query parameters to `/api/search` — `taxon`, `attr`, `attr_op`, `method`,
`prefix`, `locality`, `country`, `state`, `from`, `to`, `collector` — plus its own
`page`, independent of the one sent to `/api/search`.

## How it works

Two phases, both inside the service.

1. **Collect the GUIDs.** Run the same query `/api/search` runs — the whole matched
   Specimen set, not a page. Walk the `relations` of those documents and keep the
   `related_guid` of every entry that satisfies the predicate below.
2. **Search for those records.** An ordinary record query, filtered to `guid` being one
   of the collected GUIDs. Ordinary paging, ordinary sort, ordinary response.

The predicate belongs in phase 1 only. A link reads `host of parasite` from the shrew's
side and `parasite of` from the tapeworm's, so testing it while still on the shrew means
phase 2 never has to reason about inverses. By phase 2 the GUID set is the answer, and
the query is just a lookup.

If collecting the GUIDs turns out to be the expensive part on a broad search, the same
set can be produced as a nested composite aggregation over `related_guid` instead. That
is an implementation detail of phase 1 and changes nothing above.

**One guard.** A `terms` filter is bounded by `index.max_terms_count`, 65,536 by
default. A search matching more Specimens than that cannot be answered this way. Since
`max_result_window` already caps browsing at 10,000, refusing or capping past that limit
is reasonable — but fail loudly rather than silently truncating the GUID set, because a
truncated set returns a plausible, wrong table.

## The predicate

Applied in phase 1, to each relation of each matched Specimen. The one in the relations
doc: relationship terms within a taxon row OR; related taxa within a row OR; the
relationship and the related taxon must hold for the **same** relation; taxon rows OR
with each other; ranks map onto `related_phylclass`, `related_phylorder` and the rest;
comparisons are case-insensitive. A row naming neither a relationship nor a related
taxon contributes nothing.

## Response

The same envelope and the same record shape as `/api/search`, so the portal renders and
pages it with the code it already has:

```json
{
  "total": { "value": 190, "relation": "eq" },
  "summary": { "matched": 190 },
  "records": [{ "guid": "DMNS:Para:581", "scientific_name": "Cestoda", "...": "..." }]
}
```

`matched` counts distinct related records across the whole matched Specimen set.

## Rules

- **One row per related record.**
- **A stable sort**, so paging neither repeats nor skips.
- **Relations that point outside Arctos have no `related_guid`** — about 3% carry a
  `DZTM`, `barcode`, or `institutional catalog number` identifier instead. They have no
  document to fetch, so they cannot appear in this table. That is a known gap, not
  something to work around.
- **Same 400s as `/api/search`** for a malformed `taxon`.

## Numbers to check against

```
taxon=genus|Sorex|host of parasite|class|Cestoda
```

Measured against the live service:

```
227   Specimens matched by /api/search
229   matching relations across all of them
188   distinct related GUIDs        <- what /api/relations must return
  0   matching relations with no GUID
  0   matched Specimens with no matching relation
```

So `matched` is **188**, not 227 and not 229. Every one of the 227 shrews does carry a
cestode, but 41 cestode records are named by two shrews each — one animal catalogued
twice, as a `:Host` record and a `:Mamm` record, both pointing at the same parasite lot.
229 pairings therefore collapse to 188 distinct records. A related count coming out
higher than the Specimen count is normal too, when hosts carry several parasites; there
is no arithmetic relationship between the two numbers in either direction.

For contrast, the parasite-side search `taxon=class|Cestoda|parasite of|genus|Sorex`
returns 182. That is a different question — cestodes that name a shrew, rather than
cestodes named by these 227 shrews — and the six-record gap is the links recorded on
only one of the two sides.
