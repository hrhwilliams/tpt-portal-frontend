#!/usr/bin/env python3
"""Occupancy of the (examined for, not examined for, detected, not detected) matrix.

Per (specimen, detection value) pair, which of the four types are present?
16 possible cells. Two passes over the same parse:

  exact      - types compared at the literal attribute_value
  hierarchy  - each value expanded to its `:` ancestors first (D22), so
               `examined for: ectoparasite` pairs with `detected: ectoparasite: flea`

The hierarchy table is the one that matters: it is what the index actually
searches. The exact table is reported alongside so the difference the
expansion makes is visible rather than assumed.

Usage: python tools/profile_detection_matrix.py docs/data/dataset/msb.csv out.json
"""
import json
import sys
from collections import Counter

import pandas as pd

CHUNK = 40000
USECOLS = ["guid", "attributedetail"]

# bit per type, so a cell is a 4-bit integer
BIT = {
    "examined for": 1,
    "not examined for": 2,
    "detected": 4,
    "not detected": 8,
}
NAMES = ["examined for", "not examined for", "detected", "not detected"]


def label(mask):
    parts = [NAMES[i] for i in range(4) if mask & (1 << i)]
    return " + ".join(parts) if parts else "(none)"


def ancestors(value):
    """`a: b: c` -> [`a`, `a: b`, `a: b: c`], matching the path_hierarchy tokenizer."""
    segs = [s.strip() for s in value.split(":")]
    return [": ".join(segs[: i + 1]) for i in range(len(segs))]


def main(path, outpath):
    exact = Counter()          # mask -> (specimen, value) pairs
    hier = Counter()           # mask -> (specimen, expanded value) pairs
    exact_by_value = Counter()  # (value, mask)
    hier_by_value = Counter()
    specimens_with_detection = 0
    rows = 0
    attr_rows = 0
    detection_rows = 0
    parse_errors = 0
    # how often does the expansion move a pair out of "examined for only"?
    rescued = 0

    reader = pd.read_csv(path, chunksize=CHUNK, dtype=str, keep_default_na=False,
                         encoding="utf-8-sig", engine="c", usecols=USECOLS)

    for chunk in reader:
        rows += len(chunk)
        for adv in chunk["attributedetail"]:
            if not adv:
                continue
            try:
                detail = json.loads(adv)
            except (ValueError, TypeError):
                parse_errors += 1
                continue
            if not isinstance(detail, list):
                parse_errors += 1
                continue
            attr_rows += len(detail)

            e_exact = {}
            e_hier = {}
            for row in detail:
                if not isinstance(row, dict):
                    continue
                atype = (row.get("attribute_type") or "").strip()
                bit = BIT.get(atype)
                if bit is None:
                    continue
                value = (row.get("attribute_value") or "").strip()
                if not value:
                    continue
                detection_rows += 1
                e_exact[value] = e_exact.get(value, 0) | bit
                for anc in ancestors(value):
                    e_hier[anc] = e_hier.get(anc, 0) | bit

            if not e_exact:
                continue
            specimens_with_detection += 1
            for value, mask in e_exact.items():
                exact[mask] += 1
                exact_by_value[(value, mask)] += 1
            for value, mask in e_hier.items():
                hier[mask] += 1
                hier_by_value[(value, mask)] += 1
                # pair that looks orphaned exactly but is resolved by expansion
                if e_exact.get(value, 0) == BIT["examined for"] and mask != BIT["examined for"]:
                    rescued += 1

    out = {
        "rows": rows,
        "attribute_rows": attr_rows,
        "detection_rows": detection_rows,
        "specimens_with_detection": specimens_with_detection,
        "parse_errors": parse_errors,
        "pairs_rescued_by_hierarchy": rescued,
        "exact": {label(m): c for m, c in exact.most_common()},
        "hierarchy": {label(m): c for m, c in hier.most_common()},
        "hierarchy_by_value": {
            f"{v} || {label(m)}": c for (v, m), c in hier_by_value.most_common(200)
        },
        "exact_by_value": {
            f"{v} || {label(m)}": c for (v, m), c in exact_by_value.most_common(200)
        },
    }
    with open(outpath, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps({k: out[k] for k in
                      ("rows", "detection_rows", "specimens_with_detection",
                       "parse_errors", "pairs_rescued_by_hierarchy",
                       "exact", "hierarchy")}, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
