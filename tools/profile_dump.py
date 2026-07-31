#!/usr/bin/env python3
"""Profile an Arctos specimen dump and assert the invariants the index depends on.

Run against every new snapshot before reindexing:

    python tools/profile_dump.py test.csv
    python tools/profile_dump.py test.csv --checks-only   # exit 1 if an invariant broke

The checks matter more than the profile. Each corresponds to a decision in
docs/specs/00-decisions.md, and each failure mode is "fewer search results,
no error" -- which is why they are assertions and not observations.
"""

import argparse
import collections
import csv
import json
import re
import sys

csv.field_size_limit(10**9)  # the JSON columns blow past the default

DETECTION_TYPES = {"examined for", "not examined for", "detected", "not detected"}
TAXONOMY_COLUMNS = [
    "kingdom", "phylum", "phylclass", "superorder", "phylorder", "suborder",
    "superfamily", "family", "subfamily", "tribe", "subtribe",
    "genus", "species", "subspecies",
]


def load(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def jsoncol(value):
    """Parse a JSON column, returning [] for empty and flagging malformed rows."""
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return [{"__parse_error__": True}]
    return parsed if isinstance(parsed, list) else [parsed]


def profile(rows):
    print(f"rows={len(rows)}  columns={len(rows[0])}\n")

    fill = collections.Counter()
    for row in rows:
        for key, value in row.items():
            if value not in ("", "NULL"):
                fill[key] += 1
    print("-- columns empty in every row (do not conclude they are unused corpus-wide) --")
    print("   " + ", ".join(k for k in rows[0] if not fill[k]) + "\n")

    attrs = [a for row in rows for a in jsoncol(row["attributedetail"])]
    print(f"-- attributedetail: {len(attrs)} rows --")
    for field in ("attribute_type", "attribute_value", "attribute_determiner",
                  "attribute_date", "attribute_units", "attribute_method",
                  "attribute_remark"):
        n = sum(1 for a in attrs if a.get(field) not in (None, ""))
        print(f"   {n:6d}/{len(attrs)}  {field}")

    print("\n-- detection vocabulary --")
    pairs = collections.Counter(
        (a.get("attribute_type"), a.get("attribute_value"))
        for a in attrs if a.get("attribute_type") in DETECTION_TYPES
    )
    for (atype, value), n in sorted(pairs.items(), key=lambda kv: str(kv[0])):
        print(f"   {n:5d}  [{atype}] {value!r}")

    print("\n-- relationship vocabulary --")
    rels = [r for row in rows for r in jsoncol(row["related_record_cache"])]
    for name, n in collections.Counter(r.get("relationship") for r in rels).most_common():
        print(f"   {n:5d}  {name}")
    unresolved = sum(1 for r in rels if not r.get("family") and not r.get("identification"))
    print(f"   {unresolved}/{len(rels)} relations have no resolvable taxonomy")

    print("\n-- collections --")
    for prefix, n in collections.Counter(r["guid_prefix"] for r in rows).most_common():
        print(f"   {n:5d}  {prefix}")


def checks(rows):
    """Each check returns a list of human-readable failures."""
    failures = []

    def report(label, bad, note=""):
        if bad:
            failures.append(f"{label}: {len(bad)} affected, e.g. {bad[:3]}{note}")
        else:
            print(f"   ok    {label}")

    print("-- invariant checks --")

    # D29: a public portal must never republish encumbered records.
    report("D29 encumbrances empty",
           [r["guid"] for r in rows if r.get("encumbrances")],
           "  <-- BLOCKS PUBLIC LAUNCH")

    # D23: multi-taxon records carry two classifications joined by '; '.
    multi = [r["guid"] for r in rows
             if any("; " in r.get(c, "") for c in TAXONOMY_COLUMNS)]
    print(f"   info  D23 taxonomy needing '; ' split: {len(multi)} rows"
          + (f", e.g. {multi[:3]}" if multi else ""))

    # D22: ancestor expansion assumes the ':' convention in attribute values.
    values = {a.get("attribute_value") for row in rows
              for a in jsoncol(row["attributedetail"])
              if a.get("attribute_type") in DETECTION_TYPES}
    nested_vals = sorted(v for v in values if v and ":" in v)
    print(f"   info  D22 hierarchical detection values: {len(nested_vals)}"
          + (f", e.g. {nested_vals[:3]}" if nested_vals else ""))

    # attribute_date as a real ES date depends on it staying ISO.
    bad_dates = [a.get("attribute_date") for row in rows
                 for a in jsoncol(row["attributedetail"])
                 if a.get("attribute_date")
                 and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(a["attribute_date"]))]
    report("attribute_date is ISO", bad_dates, "  -> remap as keyword")

    bad_began = [r["began_date"] for r in rows
                 if r["began_date"] and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["began_date"])]
    report("began_date is ISO", bad_began, "  -> remap as keyword")

    # OQ14: event_count is not a reliable count of the events actually supplied.
    mismatched = [r["guid"] for r in rows
                  if r["event_count"].isdigit()
                  and int(r["event_count"]) != len(jsoncol(r["json_locality"]))]
    print(f"   info  OQ14 event_count != len(json_locality): {len(mismatched)} rows"
          + (f", e.g. {mismatched[:3]}" if mismatched else ""))

    # D26: the reason dates moved into nested events.
    widened = []
    for r in rows:
        events = jsoncol(r["json_locality"])
        dates = [e.get("began_date") for e in events if e.get("began_date")]
        if dates and r["began_date"] and min(dates) != r["began_date"]:
            widened.append(r["guid"])
        elif dates and r["ended_date"] and max(dates) > r["ended_date"]:
            widened.append(r["guid"])
    print(f"   info  D26 records whose events fall outside the top-level date range:"
          f" {len(widened)}" + (f", e.g. {widened[:3]}" if widened else ""))

    # geo_point cannot take a half-populated coordinate.
    half = [r["guid"] for r in rows if bool(r["dec_lat"]) != bool(r["dec_long"])]
    report("coordinates are both-or-neither", half, "  -> omit geo_point for these")

    # Malformed JSON would silently drop nested docs.
    broken = [r["guid"] for r in rows
              for col in ("attributedetail", "json_locality",
                          "related_record_cache", "collector_agents", "partdetail")
              if any(x.get("__parse_error__") for x in jsoncol(r[col]))]
    report("JSON columns parse", broken)

    # D30 depends on relations pointing at records the snapshot actually contains.
    known = {r["guid"] for r in rows}
    outside = collections.Counter()
    for row in rows:
        for rel in jsoncol(row["related_record_cache"]):
            record = str(rel.get("record") or "")
            if "/guid/" in record and record.rsplit("/", 1)[-1] not in known:
                outside[record.rsplit("/", 1)[-1].split(":")[0]] += 1
    if outside:
        print(f"   info  D30 relation targets outside this dump, by institution:"
              f" {dict(outside)}")

    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--checks-only", action="store_true",
                        help="skip the profile, exit 1 if an invariant failed")
    args = parser.parse_args()

    rows = load(args.path)
    if not rows:
        sys.exit("no rows")

    if not args.checks_only:
        profile(rows)
        print()

    failures = checks(rows)
    if failures:
        print("\nFAILED:")
        for line in failures:
            print(f"  - {line}")
        sys.exit(1)
    print("\nall invariants hold")


if __name__ == "__main__":
    main()
