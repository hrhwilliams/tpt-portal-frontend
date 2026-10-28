import { describe, expect, it } from "vitest";
import { escapePipes, fromParams, isEmpty, isPicked, splitPipes, toParams, togglePick } from "./query.ts";
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

describe("part round trip", () => {
  it("keeps part rows apart from attribute rows", () => {
    const parts = [
      { type: "part_name", values: ["skull", "skin, study"], negated: false },
      { type: "disposition", values: ["on loan"], negated: true },
    ];
    const q = fromParams(toParams({ ...EMPTY_QUERY, parts }));
    expect(q.parts).toEqual(parts);
    expect(q.otherAttributes).toEqual([]);
    expect(isEmpty(q)).toBe(false);
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

describe("togglePick", () => {
  const fresh = (): SearchQuery => structuredClone(EMPTY_QUERY);

  it("toggles a country in and out", () => {
    const q = fresh();
    togglePick(q, "countries", { value: "Canada" });
    expect(q.countries).toEqual(["Canada"]);
    expect(isPicked(q, "countries", { value: "Canada" })).toBe(true);
    togglePick(q, "countries", { value: "Canada" });
    expect(q.countries).toEqual([]);
  });

  it("maps collections onto guid prefixes", () => {
    const q = fresh();
    togglePick(q, "collections", { value: "MSB:Mamm" });
    expect(q.guid_prefixes).toEqual(["MSB:Mamm"]);
  });

  it("ORs a second value into the row of its type, and drops the row with its last value", () => {
    const q = fresh();
    togglePick(q, "detections", { type: "detected", value: "Hantavirus" });
    togglePick(q, "detections", { type: "detected", value: "Bartonella" });
    expect(q.detectionAttributes).toEqual([{ type: "detected", values: ["Hantavirus", "Bartonella"], negated: false }]);
    togglePick(q, "detections", { type: "detected", value: "Hantavirus" });
    togglePick(q, "detections", { type: "detected", value: "Bartonella" });
    expect(q.detectionAttributes).toEqual([]);
  });

  it("files other attributes and parts in their own lists", () => {
    const q = fresh();
    togglePick(q, "attributes", { type: "sex", value: "female" });
    togglePick(q, "parts", { type: "part_name", value: "skull" });
    expect(q.otherAttributes).toEqual([{ type: "sex", values: ["female"], negated: false }]);
    expect(q.parts).toEqual([{ type: "part_name", values: ["skull"], negated: false }]);
    expect(isPicked(q, "parts", { type: "part_name", value: "skull" })).toBe(true);
  });

  it("leaves a negated row alone", () => {
    const q = fresh();
    q.detectionAttributes = [{ type: "detected", values: ["Hantavirus"], negated: true }];
    expect(isPicked(q, "detections", { type: "detected", value: "Hantavirus" })).toBe(false);
    togglePick(q, "detections", { type: "detected", value: "Hantavirus" });
    expect(q.detectionAttributes).toHaveLength(2);
  });
});
