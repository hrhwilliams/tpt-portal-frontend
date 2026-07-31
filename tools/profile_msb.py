#!/usr/bin/env python3
"""Profile the full MSB slice (msb.csv, ~7 GB) and emit a JSON stats blob.

Streams with pandas in chunks; parses the three JSON columns
(attributedetail, json_locality, related_record_cache) per row.

Usage:  python tools/profile_msb.py msb.csv out.json
"""
import csv
import json
import sys
from collections import Counter, defaultdict

import pandas as pd

csv.field_size_limit(10**9)

TAXONOMY = [
    "kingdom", "phylum", "phylclass", "phylorder", "superfamily", "family",
    "subfamily", "tribe", "subtribe", "genus", "species", "subspecies",
    "suborder", "superorder", "infraspecific_rank",
]
DETECTION = ["detected", "examined_for", "not_detected", "not_examined_for"]
CHUNK = 20000


def jloads(s):
    if not s or s in ("[]", "{}", "null"):
        return None
    try:
        return json.loads(s)
    except Exception:
        return "PARSE_ERROR"


def main(path, outpath):
    st = {
        "rows": 0,
        "nonempty": Counter(),
        "guid_prefix": Counter(),
        "collection_cde": Counter(),
        "institution": Counter(),
        "taxon_rank": Counter(),
        "taxonomy_semicolon": Counter(),
        "taxonomy_semicolon_examples": defaultdict(list),
        "taxonomy_distinct_sample": defaultdict(set),
        "attr_type": Counter(),
        "attr_type_rowlevel": Counter(),
        "attr_value_depth": Counter(),
        "attr_value_top": Counter(),
        "attr_method_top": Counter(),
        "attr_method_distinct": set(),
        "attr_keys": Counter(),
        "attr_count_dist": Counter(),
        "attr_parse_error": 0,
        "det_nonempty": Counter(),
        "det_values": Counter(),
        "det_semicolon_rows": Counter(),
        "encumbrance_nonempty": 0,
        "encumbrance_values": Counter(),
        "jloc_len": Counter(),
        "jloc_parse_error": 0,
        "jloc_keys": Counter(),
        "event_count_vs_jloc": Counter(),
        "eventcount_mismatch_examples": [],
        "rel_parse_error": 0,
        "rel_len": Counter(),
        "rel_keys": Counter(),
        "rel_type": Counter(),
        "rel_target_prefix": Counter(),
        "rel_target_institution": Counter(),
        "date_bad": Counter(),
        "date_bad_examples": defaultdict(list),
        "began_empty": 0,
        "lst_terms": Counter(),
        "lst_comma_terms": 0,
        "lst_nonempty": 0,
        "coord_both": 0,
        "coord_lat_only": 0,
        "coord_long_only": 0,
        "coord_neither": 0,
        "fsn_tags": Counter(),
        "fsn_differs_from_sci": 0,
        "taxa_formula": Counter(),
        "sex": Counter(),
        "has_tissues": Counter(),
        "use_license_url": Counter(),
        "cols": [],
    }

    reader = pd.read_csv(
        path, chunksize=CHUNK, dtype=str, keep_default_na=False,
        encoding="utf-8-sig", engine="c", on_bad_lines="warn",
    )

    for chunk in reader:
        if not st["cols"]:
            st["cols"] = list(chunk.columns)
        st["rows"] += len(chunk)

        for col in chunk.columns:
            st["nonempty"][col] += int((chunk[col].astype(str) != "").sum())

        for col, ctr in (("guid_prefix", "guid_prefix"), ("collection_cde", "collection_cde"),
                         ("institution_acronym", "institution"), ("taxon_rank", "taxon_rank"),
                         ("taxa_formula", "taxa_formula"), ("sex", "sex"),
                         ("has_tissues", "has_tissues"), ("use_license_url", "use_license_url")):
            if col in chunk.columns:
                st[ctr].update(chunk[col].value_counts().to_dict())

        # taxonomy: multi-value detection
        for col in TAXONOMY:
            if col not in chunk.columns:
                continue
            s = chunk[col]
            hits = s[s.str.contains(";", regex=False, na=False)]
            st["taxonomy_semicolon"][col] += len(hits)
            if len(hits) and len(st["taxonomy_semicolon_examples"][col]) < 5:
                for v in hits.head(5):
                    if len(st["taxonomy_semicolon_examples"][col]) < 5:
                        st["taxonomy_semicolon_examples"][col].append(v)
            if len(st["taxonomy_distinct_sample"][col]) < 3000:
                st["taxonomy_distinct_sample"][col].update(
                    x for x in s.unique()[:500] if x
                )

        # flat detection columns
        for col in DETECTION:
            if col not in chunk.columns:
                continue
            s = chunk[col]
            ne = s[s != ""]
            st["det_nonempty"][col] += len(ne)
            st["det_semicolon_rows"][col] += int(ne.str.contains(";", regex=False).sum())
            for v in ne:
                for part in v.split(";"):
                    part = part.strip()
                    if part:
                        st["det_values"][f"{col}|{part}"] += 1

        if "encumbrances" in chunk.columns:
            ne = chunk["encumbrances"][chunk["encumbrances"] != ""]
            st["encumbrance_nonempty"] += len(ne)
            st["encumbrance_values"].update(ne.value_counts().to_dict())

        # coordinates
        if "dec_lat" in chunk.columns:
            la = chunk["dec_lat"] != ""
            lo = chunk["dec_long"] != ""
            st["coord_both"] += int((la & lo).sum())
            st["coord_lat_only"] += int((la & ~lo).sum())
            st["coord_long_only"] += int((~la & lo).sum())
            st["coord_neither"] += int((~la & ~lo).sum())

        # dates
        for col in ("began_date", "ended_date"):
            if col not in chunk.columns:
                continue
            s = chunk[col]
            if col == "began_date":
                st["began_empty"] += int((s == "").sum())
            ne = s[s != ""]
            bad = ne[~ne.str.match(r"^\d{4}-\d{2}-\d{2}$", na=False)]
            st["date_bad"][col] += len(bad)
            for v in bad.head(5):
                if len(st["date_bad_examples"][col]) < 8:
                    st["date_bad_examples"][col].append(v)

        # formatted_scientific_name
        if "formatted_scientific_name" in chunk.columns:
            ne = chunk["formatted_scientific_name"]
            import re as _re
            for v in ne.head(2000):
                for t in _re.findall(r"</?([a-zA-Z0-9]+)[^>]*>", v):
                    st["fsn_tags"][t.lower()] += 1
            st["fsn_differs_from_sci"] += int(
                ((ne != "") & (chunk["scientific_name"] != "")
                 & (ne.str.replace(r"<[^>]+>", "", regex=True) != chunk["scientific_name"])).sum()
            )

        # locality_search_terms
        if "locality_search_terms" in chunk.columns:
            for v in chunk["locality_search_terms"]:
                if not v:
                    continue
                st["lst_nonempty"] += 1
                parts = v.split(", ")
                st["lst_terms"][min(len(parts), 30)] += 1

        # ---- JSON columns ----
        for adv, jlv, rrv, ecv, guid in zip(
            chunk.get("attributedetail", pd.Series([""] * len(chunk))),
            chunk.get("json_locality", pd.Series([""] * len(chunk))),
            chunk.get("related_record_cache", pd.Series([""] * len(chunk))),
            chunk.get("event_count", pd.Series([""] * len(chunk))),
            chunk.get("guid", pd.Series([""] * len(chunk))),
        ):
            ad = jloads(adv)
            if ad == "PARSE_ERROR":
                st["attr_parse_error"] += 1
            elif isinstance(ad, list):
                st["attr_count_dist"][min(len(ad), 40)] += 1
                seen_types = set()
                for a in ad:
                    if not isinstance(a, dict):
                        continue
                    st["attr_keys"].update(a.keys())
                    t = (a.get("attribute_type") or "").strip()
                    if t:
                        st["attr_type"][t] += 1
                        seen_types.add(t)
                    val = (a.get("attribute_value") or "").strip()
                    if val:
                        st["attr_value_depth"][val.count(":") + 1] += 1
                        if len(st["attr_value_top"]) < 40000:
                            st["attr_value_top"][f"{t}|{val}"] += 1
                    m = (a.get("attribute_method") or "").strip()
                    if m:
                        if len(st["attr_method_distinct"]) < 60000:
                            st["attr_method_distinct"].add(m)
                        st["attr_method_top"][m[:80]] += 1
                st["attr_type_rowlevel"].update(seen_types)

            jl = jloads(jlv)
            if jl == "PARSE_ERROR":
                st["jloc_parse_error"] += 1
            elif isinstance(jl, list):
                st["jloc_len"][min(len(jl), 20)] += 1
                for e in jl[:5]:
                    if isinstance(e, dict):
                        st["jloc_keys"].update(e.keys())
                try:
                    ec = int(ecv) if ecv not in ("", None) else None
                except Exception:
                    ec = None
                if ec is not None:
                    st["event_count_vs_jloc"][f"{ec}|{len(jl)}"] += 1
                    if ec != len(jl) and len(st["eventcount_mismatch_examples"]) < 20:
                        st["eventcount_mismatch_examples"].append(
                            {"guid": guid, "event_count": ec, "json_locality_len": len(jl)}
                        )

            rr = jloads(rrv)
            if rr == "PARSE_ERROR":
                st["rel_parse_error"] += 1
            elif isinstance(rr, list):
                st["rel_len"][min(len(rr), 20)] += 1
                for r in rr:
                    if not isinstance(r, dict):
                        continue
                    st["rel_keys"].update(r.keys())
                    rt = (r.get("relationship") or r.get("related_relationship")
                          or r.get("relation") or "").strip()
                    if rt:
                        st["rel_type"][rt] += 1
                    tgt = (r.get("record") or r.get("guid") or r.get("related_guid") or "")
                    if isinstance(tgt, str) and ":" in tgt:
                        bits = tgt.split(":")
                        st["rel_target_institution"][bits[0]] += 1
                        st["rel_target_prefix"][":".join(bits[:2])] += 1

        if st["rows"] % 200000 < CHUNK:
            print(f"  ... {st['rows']:,} rows", flush=True)

    # serialize
    def top(c, n=60):
        return dict(c.most_common(n))

    out = {
        "rows": st["rows"],
        "columns": st["cols"],
        "nonempty": dict(st["nonempty"]),
        "empty_columns": sorted(c for c in st["cols"] if st["nonempty"][c] == 0),
        "guid_prefix": top(st["guid_prefix"], 100),
        "collection_cde": top(st["collection_cde"], 60),
        "institution": top(st["institution"], 60),
        "taxon_rank": top(st["taxon_rank"], 40),
        "taxa_formula": top(st["taxa_formula"], 40),
        "taxonomy_semicolon": dict(st["taxonomy_semicolon"]),
        "taxonomy_semicolon_examples": {k: v for k, v in st["taxonomy_semicolon_examples"].items()},
        "taxonomy_distinct_sample_sizes": {k: len(v) for k, v in st["taxonomy_distinct_sample"].items()},
        "attr_type": top(st["attr_type"], 200),
        "attr_type_rowlevel": top(st["attr_type_rowlevel"], 200),
        "attr_value_depth": dict(st["attr_value_depth"]),
        "attr_value_top": top(st["attr_value_top"], 250),
        "attr_value_distinct_seen": len(st["attr_value_top"]),
        "attr_method_top": top(st["attr_method_top"], 120),
        "attr_method_distinct": len(st["attr_method_distinct"]),
        "attr_keys": dict(st["attr_keys"]),
        "attr_count_dist": dict(st["attr_count_dist"]),
        "attr_parse_error": st["attr_parse_error"],
        "det_nonempty": dict(st["det_nonempty"]),
        "det_semicolon_rows": dict(st["det_semicolon_rows"]),
        "det_values": top(st["det_values"], 250),
        "det_values_distinct": len(st["det_values"]),
        "encumbrance_nonempty": st["encumbrance_nonempty"],
        "encumbrance_values": top(st["encumbrance_values"], 30),
        "jloc_len": dict(st["jloc_len"]),
        "jloc_keys": dict(st["jloc_keys"]),
        "jloc_parse_error": st["jloc_parse_error"],
        "event_count_vs_jloc": top(st["event_count_vs_jloc"], 60),
        "eventcount_mismatch_examples": st["eventcount_mismatch_examples"],
        "rel_len": dict(st["rel_len"]),
        "rel_keys": dict(st["rel_keys"]),
        "rel_type": top(st["rel_type"], 100),
        "rel_target_institution": top(st["rel_target_institution"], 60),
        "rel_target_prefix": top(st["rel_target_prefix"], 80),
        "rel_parse_error": st["rel_parse_error"],
        "date_bad": dict(st["date_bad"]),
        "date_bad_examples": dict(st["date_bad_examples"]),
        "began_empty": st["began_empty"],
        "lst_nonempty": st["lst_nonempty"],
        "lst_term_count_dist": dict(st["lst_terms"]),
        "coords": {
            "both": st["coord_both"], "lat_only": st["coord_lat_only"],
            "long_only": st["coord_long_only"], "neither": st["coord_neither"],
        },
        "fsn_tags": dict(st["fsn_tags"]),
        "fsn_differs_from_sci": st["fsn_differs_from_sci"],
        "sex": top(st["sex"], 30),
        "has_tissues": top(st["has_tissues"], 10),
        "use_license_url": top(st["use_license_url"], 20),
    }
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"done: {st['rows']:,} rows -> {outpath}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
