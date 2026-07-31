# Spec 05 — Results table, pagination, CSV export

Depends on specs 02 and 04.

## Table

Columns: catalog GUID (links to the Arctos record), scientific name, family, country, state/province, locality, collection date.

- GUID links out to `https://arctos.database.museum/guid/{guid}` — confirmed from `related_record_cache.record` in the dump. `guid` already carries the full `MSB:Mamm:151352` form, so `guid_prefix` is not needed to build the URL. OQ6 closed.
- **A specimen can have several events (D26/D27), and the row expands to show them (D44).** Collapsed, one row per specimen showing the _matched_ event. Expanded, every event with its date, locality, and coordinates.

  This is the only presentation that makes duplicate georeferences legible. ~2% of specimens have several events, and "3 events" usually means one visit recorded three ways — same date and place, coordinates differing in the fourth decimal — not three collections. A count badge alone implies the opposite; the expanded view shows the near-identical coordinates and the reader draws the right conclusion without being told.

  The expand control states the count and stays keyboard-reachable (`<button aria-expanded>`, not a click handler on a row). Rows with one event have no control at all rather than a disabled one.

- Records with no event at all show "no locality recorded" rather than an empty cell (D28), so missing is distinguishable from not-matching.
- Scientific names are italicised. If `formatted_scientific_name` is used for this, it is untrusted HTML from the dump — escape or strip, never `{@html}`.
- Long locality strings truncate with the full value in `title`.
- Empty state distinguishes "no matches for this query" from "no query entered".
- The count header renders `10,000+` when `total_is_lower_bound` is true (D19) — never a fake exact number.
- Header states the snapshot date from the schema response (D2).

## Pagination

D19/D20 (>10M docs, large result sets) and D17 (URL-addressable queries) conflict: `search_after` is the correct deep-paging tool but has no page numbers, so it cannot back a `?page=7` deep link.

Resolution, **pending your confirmation (OQ2)**:

- **UI paging uses `from`/`size`, capped at `from + size <= 10000`.** Page numbers work, deep links work, cost is bounded.
- Hitting the cap shows: _"Only the first 10,000 results can be browsed. Narrow your search, or export the full result set."_
- **Export uses PIT + `search_after`** and is not subject to the 10k cap.

This is the standard resolution and matches how users actually behave — nobody browses to page 400, they export.

## CSV export

`GET /api/export?<same params as search>` → `text/csv`.

- **Streamed**, never buffered. axum `Body::from_stream` over a `search_after` loop; the response starts before the query finishes.
- Point-in-time context so pagination is consistent while the (rebuilt-on-snapshot) index sits underneath.
- Page size 1000 internally, sort `[{"guid":"asc"}]` — deterministic and unique, which `search_after` requires.
- Hard cap `max_export_rows` (100k default, published in `/api/schema`). On truncation, the final CSV line is a comment row stating the export was truncated — a silently short file is a data-integrity problem in a research context.
- PIT is released in all paths, including client disconnect. Leaked PITs pin segments and grow disk use.
- Rate limit: 2 concurrent exports per IP, 5/hour. Public + unauthenticated + >10M docs makes this the most abusable endpoint in the system (D15), and D38 puts it directly on the internet with no proxy in front — the limit is the whole defence.
- CORS applies here too (spec 02). A streaming response still needs the allowlisted origin header, and it must be set on the _first_ byte, before the stream opens.

### CSV contents

**One row per specimen (D39).** Row count equals result count, which is what people expect from a search export and what makes the file safe to join against anything else.

The problem that shape creates: a specimen can match on several attribute rows, and D18 exists precisely because method, date, and determiner vary _between_ those rows. Collapsing them into one cell would destroy the correlation the whole query is built to preserve.

Solution: **aligned parallel columns.** Matched attribute detail goes into `; `-joined lists where the *N*th element of every list refers to the same attribute row.

```
guid             matched_type  matched_value                            matched_method  matched_date
MSB:Mamm:348964  detected      ectoparasite: flea; ectoparasite: louse  comb; comb      2019-06-01; 2019-06-01
MSB:Mamm:293371  not detected  virus: Orthohantavirus                   immunoblot      2001-03-14
```

Rules that make this readable rather than a trap:

- **Every parallel column has the same element count on every row**, including empties. An attribute row with no method contributes an empty element, not a missing one — otherwise position stops meaning anything and the alignment silently lies. This is the one invariant worth a test.
- Columns in the group: `matched_type`, `matched_value`, `matched_method`, `matched_remark`, `matched_date`, `matched_determiner`, `matched_units`.
- **Only attribute rows matching the query filter.** The user asked about hantavirus, not every measurement ever taken. `attribute_count_total` records how many the specimen has overall, so elision is visible.
- The header comment names the alignment convention explicitly. A reader who does not know it will misread the file, and there is no way to infer it from the data.

Multi-event specimens collapse the same way: the **matched** event's fields, plus an `event_count` column. A specimen matching on two events still produces one row, and `event_count` tells the reader to go look at the record.

If a fully relational export is ever wanted, the clean answer is two files in a zip (`specimens.csv` + `attributes.csv`, joined on `guid`) — rejected here only because it cannot be streamed, and streaming is what makes the export work at 100k rows.

`attribute_date` must be in the export with a header that does not call it a test date — it is often the load date, and one record's own remark says so (spec 07). `attribute_date_note` alongside it, or a documented caveat in the header comment.

- **`use_license_url` is a required column.** Licences are per-record — five combinations across 741,801 rows, from CC0 to CC BY-NC-SA, and every row carries two `; `-joined URLs (a terms-of-use URL plus a Creative Commons URL). The export carries the string **verbatim**: it is the licence statement as issued. The table and the export header additionally render the short label from `ctlicense` — `CC BY-NC`, `CC0`, `Copyright Restricted` — since a URL is not a licence a reader can act on at a glance (spec 09). The non-commercial terms on 94% of records matter to whoever receives the file.
- Header row uses the same names as the ES fields, so exports are self-documenting against the mapping.
- RFC 4180 quoting. Locality and remark fields contain commas and quotes routinely.
- Filename: `tpt-export-YYYYMMDD-HHMMSS.csv`.
- A leading comment line recording the query params and snapshot date makes the export reproducible — this is the provenance a citation needs.

## Tests

- Export of 2500 fixture docs paginates correctly across three internal batches with no duplicates and no gaps.
- **Parallel-column alignment:** on every row, all seven `matched_*` columns split to the same element count, including when method, remark, or units are absent. Run it over the `MSB:Mamm:348964` shape, which has two matched attributes with differing detail.
- Truncation at the cap emits the truncation marker.
- Client disconnect mid-stream releases the PIT.
- CSV round-trips through a strict parser with locality values containing `,` and `"`.
