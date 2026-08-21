import { describe, expect, it } from "vitest";
import { escapePipes, fromParams, isEmpty, splitPipes, toParams } from "./query.ts";
import { EMPTY_QUERY, type SearchQuery } from "./types.ts";

/** Names chosen to collide with the delimiter, the escape, or both. */
const HOSTILE = [
  "|",
  "||",
  "|||",
  "a|",
  "|a",
  "a||b",
  "\\",
  "\\\\",
  "\\|",
  "|\\",
  "a\\|b",
  "\\|\\|",
  "x|y|z",
  "a; b",
  "species|Ixodidae|family|Aus",
];

describe("splitPipes", () => {
  it("splits on unescaped pipes", () => {
    expect(splitPipes("species|Myodes gapperi")).toEqual(["species", "Myodes gapperi"]);
  });

  it("reads an escaped pipe as content", () => {
    expect(splitPipes("species|Aus \\| Bus|parasite of")).toEqual(["species", "Aus | Bus", "parasite of"]);
  });

  it("distinguishes a delimiter next to an escaped pipe from the reverse", () => {
    // `genus` + delimiter + a name of `|`, versus a rank of `genus|` + delimiter + an empty name.
    expect(splitPipes(`${escapePipes("genus")}|${escapePipes("|")}`)).toEqual(["genus", "|"]);
    expect(splitPipes(`${escapePipes("genus|")}|${escapePipes("")}`)).toEqual(["genus|", ""]);
  });

  it("treats an escaped backslash as content, not as an escape", () => {
    expect(splitPipes("a\\\\|b")).toEqual(["a\\", "b"]);
  });

  it("never loses a segment boundary, whatever the field holds", () => {
    for (const name of HOSTILE) {
      const encoded = ["species", name, "parasite of"].map(escapePipes).join("|");
      expect(splitPipes(encoded), name).toEqual(["species", name, "parasite of"]);
    }
  });

  it("never invents a segment boundary, whatever the field holds", () => {
    for (const name of HOSTILE) {
      expect(splitPipes(escapePipes(name)), name).toHaveLength(1);
    }
  });
});

describe("attribute round trip", () => {
  const roundTrip = (rows: SearchQuery["otherAttributes"]) =>
    fromParams(toParams({ ...EMPTY_QUERY, otherAttributes: rows })).otherAttributes;

  it("keeps several values apart", () => {
    const rows = [{ type: "sex", values: ["male", "female"], negated: false }];
    expect(roundTrip(rows)).toEqual(rows);
  });

  it("survives a value containing a semicolon", () => {
    const rows = [{ type: "location in host", values: ["liver; spleen"], negated: false }];
    expect(roundTrip(rows)).toEqual(rows);
  });

  it("survives every hostile value", () => {
    for (const value of HOSTILE) {
      const rows = [{ type: "description", values: [value], negated: true }];
      expect(roundTrip(rows), value).toEqual(rows);
    }
  });

  it("keeps a hostile value from splitting into extra values", () => {
    const rows = [{ type: "description", values: ["a|b|c"], negated: false }];
    expect(roundTrip(rows)).toEqual(rows);
  });
});

describe("taxon round trip", () => {
  const roundTrip = (taxa: SearchQuery["taxa"]) => fromParams(toParams({ ...EMPTY_QUERY, taxa })).taxa;

  it("survives every hostile name", () => {
    for (const name of HOSTILE) {
      const taxa = [{ rank: "species", name, relations: ["parasite of"], related: [] }];
      expect(roundTrip(taxa), name).toEqual(taxa);
    }
  });

  it("keeps a hostile name from faking the pairwise shape", () => {
    // A five-segment `taxon` value is reserved for a related taxon search, so a
    // name full of pipes must still decode as one rank, one name, one relation.
    const taxa = [{ rank: "genus", name: "Myodes|host of parasite|family|Ixodidae", relations: [], related: [] }];
    expect(roundTrip(taxa)).toEqual(taxa);
    expect(splitPipes(toParams({ ...EMPTY_QUERY, taxa }).get("taxon")!)).toHaveLength(2);
  });

  it("carries several related taxa", () => {
    const taxa = [
      {
        rank: "genus",
        name: "Sorex",
        relations: ["host of parasite"],
        related: [
          { rank: "family", name: "Ixodidae" },
          { rank: "genus", name: "Aus" },
          { rank: "species", name: "Bus cus" },
        ],
      },
    ];
    expect(roundTrip(taxa)).toEqual(taxa);
  });

  it("keeps the relations segment when only related taxa are set", () => {
    const taxa = [{ rank: "genus", name: "Sorex", relations: [], related: [{ rank: "family", name: "Ixodidae" }] }];
    expect(roundTrip(taxa)).toEqual(taxa);
    expect(toParams({ ...EMPTY_QUERY, taxa }).get("taxon")).toBe("genus|Sorex||family|Ixodidae");
  });

  it("survives a hostile related name", () => {
    for (const name of HOSTILE) {
      const taxa = [
        { rank: "genus", name: "Sorex", relations: ["host of parasite"], related: [{ rank: "family", name }] },
      ];
      expect(roundTrip(taxa), name).toEqual(taxa);
    }
  });

  it("carries a relationship with no taxon at all", () => {
    const taxa = [{ rank: "", name: "", relations: ["host of parasite"], related: [] }];
    expect(toParams({ ...EMPTY_QUERY, taxa }).get("taxon")).toBe("||host of parasite");
    expect(roundTrip(taxa)).toEqual(taxa);
    expect(isEmpty({ ...EMPTY_QUERY, taxa })).toBe(false);
  });

  it("drops a row that names nothing", () => {
    const taxa = [{ rank: "genus", name: "", relations: [], related: [] }];
    expect(toParams({ ...EMPTY_QUERY, taxa }).getAll("taxon")).toEqual([]);
    expect(isEmpty({ ...EMPTY_QUERY, taxa })).toBe(true);
  });
});
