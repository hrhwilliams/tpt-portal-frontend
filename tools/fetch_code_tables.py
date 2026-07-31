#!/usr/bin/env python3
"""Snapshot the Arctos code tables the portal depends on.

The authority API is the source of truth for controlled vocabularies, their
human-readable descriptions, and — critically — `ctattribute_type.public`,
which says whether an attribute type may be shown outside Arctos.

Run this alongside each data snapshot. The output feeds `GET /api/schema`
(spec 03) and the ETL's public-attribute filter (spec 01).

    export ARCTOS_API_KEY=...          # IP-bound; ask whoever owns the dump
    python tools/fetch_code_tables.py docs/data/code-tables

Fetches every table by default. Pass --tables a,b,c to narrow.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import requests

API = "https://arctos.database.museum/component/api/v2/authority.cfc"

# The tables the specs actually depend on. Everything else is fetched too,
# but these are the ones a build should fail without.
REQUIRED = [
    "ctattribute_type",       # value_code_table / unit_code_table / public
    "ctexamined_detected",    # the detection vocabulary (D21, D22)
    "ctlicense",              # use_license_url -> short label (spec 05)
    "ctcollector_role",       # role filtering for collector_ids (spec 01)
    "ctlocation_in_host",     # `location in host`, `parts examined`
    "ctlife_stage",
    "ctsex_cde",
    "cttaxa_formula",
    "ctspecimen_event_type",
    "ctcollecting_source",
    "ctverificationstatus",
]


def get(session, key, **params):
    r = session.get(API, params={"method": "code_tables", "api_key": key, **params},
                    timeout=120)
    r.raise_for_status()
    return r.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--tables", help="comma-separated subset")
    args = ap.parse_args()

    key = os.environ.get("ARCTOS_API_KEY")
    if not key:
        sys.exit("ARCTOS_API_KEY is not set. The key is IP-bound; it is not "
                 "checked into this repo.")

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    session = requests.Session()

    names = ([t.strip() for t in args.tables.split(",")] if args.tables
             else [t["table_name"] for t in get(session, key)["TBL"]])

    missing_required = [t for t in REQUIRED if t not in names]
    if missing_required:
        sys.exit(f"authority API no longer lists required tables: {missing_required}")

    summary = {}
    for name in names:
        try:
            payload = get(session, key, tbl=name)
        except Exception as exc:
            if name in REQUIRED:
                sys.exit(f"required table {name} failed: {exc}")
            summary[name] = f"ERROR {exc}"
            continue
        (out / f"{name}.json").write_text(
            json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        summary[name] = len(payload.get("data", []))

    # The one assertion worth making loudly: a public portal must never index
    # an attribute type Arctos marks non-public.
    attr = json.loads((out / "ctattribute_type.json").read_text(encoding="utf-8"))
    nonpublic = sorted(a["attribute_type"] for a in attr["data"] if not a.get("public"))
    (out / "_nonpublic_attribute_types.json").write_text(
        json.dumps(nonpublic, indent=1), encoding="utf-8")

    print(f"{len(summary)} tables -> {out}")
    print(f"non-public attribute types ({len(nonpublic)}): {', '.join(nonpublic)}")
    print("  the ETL must drop these; see spec 01")


if __name__ == "__main__":
    main()
