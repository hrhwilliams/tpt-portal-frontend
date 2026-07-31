#!/usr/bin/env python3
"""Second, targeted pass over msb.csv — the questions that decide mapping types.

1. attribute_date format at scale (ES `date` vs `keyword`)
2. attribute_value colon depth, restricted to the four detection types (D22)
3. relationship direction: which guid_prefix carries `host of parasite` (D30)
4. related_record_cache `record` value forms (URL vs bare GUID vs junk)
5. use_license_url multi-valued?
"""
import json
import re
import sys
from collections import Counter

import pandas as pd

CHUNK = 40000
DETECTION = {"detected", "not detected", "examined for", "not examined for"}
USECOLS = ["guid", "guid_prefix", "attributedetail", "related_record_cache",
           "use_license_url", "began_date"]

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_T = re.compile(r"^\d{4}-\d{2}-\d{2}T")
YM = re.compile(r"^\d{4}-\d{2}$")
Y = re.compile(r"^\d{4}$")


def dfmt(v):
    if not v:
        return "empty"
    if ISO.match(v):
        return "YYYY-MM-DD"
    if ISO_T.match(v):
        return "datetime"
    if YM.match(v):
        return "YYYY-MM"
    if Y.match(v):
        return "YYYY"
    return "other"


def main(path, outpath):
    attr_date_fmt = Counter()
    attr_date_other = Counter()
    det_depth = Counter()
    det_value = Counter()
    det_value_by_type = Counter()
    nondet_depth = Counter()
    nondet_deep_examples = Counter()
    rel_by_holder = Counter()          # (holder guid_prefix, relationship)
    rel_pair_target = Counter()        # (relationship, target prefix)
    rec_form = Counter()
    rec_junk = Counter()
    lic_multi = Counter()
    rows = 0

    reader = pd.read_csv(path, chunksize=CHUNK, dtype=str, keep_default_na=False,
                         encoding="utf-8-sig", engine="c", usecols=USECOLS)

    for chunk in reader:
        rows += len(chunk)
        for v in chunk["use_license_url"]:
            lic_multi[v.count(";") + 1 if v else 0] += 1

        for gp, adv, rrv in zip(chunk["guid_prefix"], chunk["attributedetail"],
                                chunk["related_record_cache"]):
            if adv and adv not in ("[]", "null"):
                try:
                    ad = json.loads(adv)
                except Exception:
                    ad = []
                for a in ad:
                    if not isinstance(a, dict):
                        continue
                    t = (a.get("attribute_type") or "").strip()
                    dv = (a.get("attribute_date") or "").strip()
                    f = dfmt(dv)
                    attr_date_fmt[f] += 1
                    if f == "other" and len(attr_date_other) < 40:
                        attr_date_other[dv[:40]] += 1
                    val = (a.get("attribute_value") or "").strip()
                    if not val:
                        continue
                    if t in DETECTION:
                        det_depth[val.count(":") + 1] += 1
                        det_value[val] += 1
                        det_value_by_type[f"{t}|{val}"] += 1
                    else:
                        d = val.count(":") + 1
                        nondet_depth[d] += 1
                        if d >= 3 and len(nondet_deep_examples) < 40:
                            nondet_deep_examples[f"{t}|{val[:60]}"] += 1

            if rrv and rrv not in ("[]", "null"):
                try:
                    rr = json.loads(rrv)
                except Exception:
                    rr = []
                for r in rr:
                    if not isinstance(r, dict):
                        continue
                    rel = (r.get("relationship") or "").strip()
                    rel_by_holder[f"{gp}|{rel}"] += 1
                    rec = (r.get("record") or "").strip()
                    if rec.startswith("http"):
                        rec_form["url"] += 1
                        tail = rec.rsplit("/", 1)[-1]
                        pre = ":".join(tail.split(":")[:2]) if ":" in tail else "?"
                        rel_pair_target[f"{rel}|{pre}"] += 1
                    elif not rec:
                        rec_form["empty"] += 1
                    elif re.match(r"^[A-Za-z]+:[A-Za-z]+:", rec):
                        rec_form["bare_guid"] += 1
                        rel_pair_target[f"{rel}|{':'.join(rec.split(':')[:2])}"] += 1
                    else:
                        rec_form["other"] += 1
                        if len(rec_junk) < 40:
                            rec_junk[rec[:50]] += 1

        if rows % 200000 < CHUNK:
            print(f"  ... {rows:,} rows", flush=True)

    out = {
        "rows": rows,
        "attr_date_fmt": dict(attr_date_fmt),
        "attr_date_other_examples": dict(attr_date_other),
        "detection_value_depth": dict(det_depth),
        "detection_values": dict(det_value.most_common(80)),
        "detection_value_by_type": dict(det_value_by_type.most_common(120)),
        "detection_values_distinct": len(det_value),
        "nondetection_value_depth": dict(nondet_depth),
        "nondetection_deep_examples": dict(nondet_deep_examples),
        "relationship_by_holder_prefix": dict(rel_by_holder.most_common(120)),
        "relationship_target_prefix": dict(rel_pair_target.most_common(120)),
        "record_forms": dict(rec_form),
        "record_junk_examples": dict(rec_junk),
        "use_license_value_count": dict(lic_multi),
    }
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"done: {rows:,} rows -> {outpath}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
