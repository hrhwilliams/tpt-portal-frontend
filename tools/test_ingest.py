"""Self-check for the ingest derivations.

    python tools/test_ingest.py

Covers only what the ETL derives rather than copies. Each of these fails by
returning fewer results with no error, so none of them is safe to eyeball.

`ingest` imports the elasticsearch client inside main(), so this runs without a
server or the client library installed.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ingest as m  # noqa: E402


def as_csv_row(row):
    """The real reader hands every cell over as a string."""
    return {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in row.items()}


ROW = {
    "guid": "MSB:Mamm:1",
    "collection_object_id": "1",
    "encumbrances": "",
    "event_count": "2",
    "json_locality": [
        {"began_date": "2016-07-09", "spec_locality": "A", "dec_lat": "35.1", "dec_long": "-106.6"},
        {"began_date": "2016-08-12", "spec_locality": "A", "dec_lat": "", "dec_long": ""},
    ],
    "attributedetail": [
        {"attribute_type": "detected", "attribute_value": "ectoparasite: flea"},
        {"attribute_type": "examined for", "attribute_value": "ectoparasite"},
        {"attribute_type": "weight", "attribute_value": "20", "attribute_units": "g"},
        {"attribute_type": "restricted data", "attribute_value": "secret"},
    ],
    "related_record_cache": [
        {
            "relationship": "parasite of",
            "record": "https://arctos.database.museum/guid/MSB:Para:9",
            "family": "Taeniidae",
        },
        {"relationship": "parasite of", "record": "A4HEG"},
    ],
    "collector_agents": [
        {"agent_id": "agent/1", "agent_name": "X", "agent_role": "collector"},
        {"agent_id": "agent/2", "agent_name": "Y", "agent_role": "preparator"},
    ],
}

DOCUMENTED = {"detected", "examined for", "weight", "restricted data"}
NONPUBLIC = {"restricted data"}


def main():
    doc = m.build_document(as_csv_row(ROW), NONPUBLIC, DOCUMENTED)

    # every event is kept; duplicates are not merged
    assert len(doc["events"]) == 2, doc["events"]

    # a geo_point with a null half fails the bulk request, and 0,0 is worse
    assert "coordinates" in doc["events"][0]
    assert "coordinates" not in doc["events"][1]

    # rollups span every event, not just the first
    assert doc["event_date_min"] == "2016-07-09"
    assert doc["event_date_max"] == "2016-08-12"

    # flat arrays come from the same parse as the nested docs
    assert doc["detected"] == ["ectoparasite: flea"], doc["detected"]
    assert doc["examined_for"] == ["ectoparasite"]
    assert doc["not_detected"] is None

    # values are exact — no ancestor is invented from `ectoparasite: flea`
    assert "ectoparasite" not in doc["detected"]

    # public: 0 never reaches the index
    assert len(doc["attributedetail"]) == 3, doc["attributedetail"]
    assert all(a["attribute_type"] != "restricted data" for a in doc["attributedetail"])
    assert m.stats["nonpublic_dropped"] == 1

    # the rollup is role-filtered; the preparator is in `agents` but not here
    assert doc["collector_ids"] == ["agent/1"], doc["collector_ids"]
    assert len(doc["agents"]) == 2

    # relations are copied, with `record` normalised to a bare GUID; an
    # unresolvable identifier keeps its identifier and gets no GUID
    assert doc["relations"][0]["related_guid"] == "MSB:Para:9"
    assert doc["relations"][0]["related_family"] == "Taeniidae"
    assert "related_guid" not in doc["relations"][1]
    assert doc["relations"][1]["related_identifier"] == "A4HEG"
    assert m.stats["relations_unresolved"] == 1

    # a record with no json_locality but a top-level date still gets one event,
    # or it would be unfindable by date despite having one
    sparse = m.build_document(
        as_csv_row({"guid": "MSB:Bird:6062", "collection_object_id": "2", "began_date": "1985-02-07"}),
        NONPUBLIC,
        DOCUMENTED,
    )
    assert len(sparse["events"]) == 1
    assert sparse["events"][0]["synthesized"] is True

    # a record with neither gets no events at all, which is correct
    bare = m.build_document(
        as_csv_row({"guid": "MSB:Herp:57260", "collection_object_id": "3"}), NONPUBLIC, DOCUMENTED
    )
    assert bare["events"] == []
    assert bare["event_date_min"] is None

    # encumbered data stops the build rather than leaking
    try:
        m.build_document(
            as_csv_row({"guid": "x", "collection_object_id": "4", "encumbrances": "restricted"}),
            NONPUBLIC,
            DOCUMENTED,
        )
    except SystemExit:
        pass
    else:
        raise AssertionError("encumbrances must abort the build")

    print("ingest derivations OK")


if __name__ == "__main__":
    main()
