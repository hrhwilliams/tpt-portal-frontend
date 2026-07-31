#!/usr/bin/env python3
"""Distinct guid_prefix, scientific_name, country and state_prov values, with counts.

Feeds the `/api/schema` collection list and the taxon-name index. Both are
aggregations in the real service; here they come from the slice.

  python tools/profile_prefix_sciname.py docs/data/dataset/msb.csv out.json
"""
import json
import sys
from collections import Counter

import pandas as pd

CHUNK = 100000
USECOLS = ["guid_prefix", "scientific_name", "institution_acronym", "collection_cde",
           "country", "state_prov"]
TOP_NAMES = 1500


def main(path, outpath):
    prefix = Counter()
    sciname = Counter()
    country = Counter()
    state = Counter()
    prefix_meta = {}
    rows = 0

    reader = pd.read_csv(path, chunksize=CHUNK, dtype=str, keep_default_na=False,
                         encoding="utf-8-sig", engine="c", usecols=USECOLS)
    for chunk in reader:
        rows += len(chunk)
        for c in chunk["country"]:
            c = (c or "").strip()
            if c:
                country[c] += 1
        for st in chunk["state_prov"]:
            st = (st or "").strip()
            if st:
                state[st] += 1
        for gp, sn, inst, cde in zip(chunk["guid_prefix"], chunk["scientific_name"],
                                     chunk["institution_acronym"], chunk["collection_cde"]):
            gp = (gp or "").strip()
            if gp:
                prefix[gp] += 1
                if gp not in prefix_meta:
                    prefix_meta[gp] = {"institution": (inst or "").strip(),
                                       "collection_cde": (cde or "").strip()}
            sn = (sn or "").strip()
            if sn:
                sciname[sn] += 1

    out = {
        "rows": rows,
        "guid_prefix": [
            {"value": k, "count": v, **prefix_meta.get(k, {})}
            for k, v in prefix.most_common()
        ],
        "country": [{"value": k, "count": v} for k, v in country.most_common()],
        "state_prov": [{"value": k, "count": v} for k, v in state.most_common()],
        "scientific_name_distinct": len(sciname),
        # capped so the committed profile stays a reasonable size; the taxon
        # fixture only needs enough names for autocomplete to feel real
        "scientific_name_top": [{"name": k, "count": v} for k, v in sciname.most_common(TOP_NAMES)],
    }
    with open(outpath, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    print(f"rows={rows} guid_prefix={len(prefix)} scientific_name={len(sciname)} "
          f"country={len(country)} state_prov={len(state)}")
    for k, v in prefix.most_common(15):
        print(f"  {k:24} {v:>8,}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
