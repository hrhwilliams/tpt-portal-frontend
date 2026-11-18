import { describe, expect, it } from "vitest";
import {
  canPickTaxon,
  escapePipes,
  exportParams,
  fromParams,
  isEmpty,
  isPicked,
  requestParams,
  splitPipes,
  toParams,
  togglePick,
  toggleTaxon,
} from "./query.ts";
import { EMPTY_QUERY, type SearchQuery, type TaxonPair } from "./types.ts";

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

  it("sets the one collector filter, replacing another and clearing on a second click", () => {
    const q = fresh();
    togglePick(q, "collectors", { value: "J. Smith" });
    expect(q.agent).toBe("J. Smith");
    expect(isPicked(q, "collectors", { value: "J. Smith" })).toBe(true);
    togglePick(q, "collectors", { value: "A. Jones" });
    expect(q.agent).toBe("A. Jones");
    togglePick(q, "collectors", { value: "A. Jones" });
    expect(q.agent).toBe("");
  });

  it("leaves a negated row alone", () => {
    const q = fresh();
    q.detectionAttributes = [{ type: "detected", values: ["Hantavirus"], negated: true }];
    expect(isPicked(q, "detections", { type: "detected", value: "Hantavirus" })).toBe(false);
    togglePick(q, "detections", { type: "detected", value: "Hantavirus" });
    expect(q.detectionAttributes).toHaveLength(2);
  });
});

describe("cols", () => {
  it("sends one comma-separated param and reads it back", () => {
    const p = toParams({ ...EMPTY_QUERY, agent: "x", cols: ["guid", "country"] });
    expect(p.get("cols")).toBe("guid,country");
    expect(fromParams(p).cols).toEqual(["guid", "country"]);
  });

  it("is not a search on its own", () => {
    expect(isEmpty({ ...EMPTY_QUERY, cols: ["guid"] })).toBe(true);
  });
});

describe("null rows", () => {
  it("sends attr=null and part=!null, and reads them back as rows", () => {
    const q = {
      ...EMPTY_QUERY,
      otherAttributes: [{ type: "null", values: [], negated: false }],
      parts: [{ type: "null", values: [], negated: true }],
    };
    const p = toParams(q);
    expect(p.get("attr")).toBe("null");
    expect(p.get("part")).toBe("!null");
    const back = fromParams(p);
    expect(back.otherAttributes).toEqual(q.otherAttributes);
    expect(back.parts).toEqual(q.parts);
    expect(isEmpty(back)).toBe(false);
  });
});

describe("none relationship", () => {
  it("sends rank|name|null and reads it back", () => {
    const taxa = [{ rank: "genus", name: "Sorex", relations: ["null"], related: [] }];
    const p = toParams({ ...EMPTY_QUERY, taxa });
    expect(p.get("taxon")).toBe("genus|Sorex|null");
    expect(fromParams(p).taxa).toEqual(taxa);
  });
});

describe("requestParams", () => {
  const url = (s: string) => new URLSearchParams(s);
  const rel = "host of parasite";

  it("keeps tab from every request except as the relationship a related one follows", () => {
    const r = requestParams(url(`taxon=a&tab=${encodeURIComponent(rel)}`), [rel, "parasite of"]);
    expect(r.summary.has("tab")).toBe(false);
    expect(r.records.has("tab")).toBe(false);
    expect(r.related.map((x) => [x.relation, x.params.get("tab")])).toEqual([
      [rel, rel],
      ["parasite of", "parasite of"],
    ]);
  });

  it("gives the page to the records table when it is open", () => {
    const r = requestParams(url("taxon=a&tab=records&page=3"), [rel]);
    expect(r.records.get("page")).toBe("3");
    expect(r.related[0].params.has("page")).toBe(false);
    expect(r.summary.has("page")).toBe(false);
  });

  it("gives the page only to the related table that is open", () => {
    const r = requestParams(url(`taxon=a&tab=${encodeURIComponent(rel)}&page=3`), [rel, "parasite of"]);
    expect(r.related.map((x) => x.params.get("page"))).toEqual(["3", null]);
    expect(r.records.has("page")).toBe(false);
  });

  it("passes every other param through", () => {
    const r = requestParams(url("taxon=a&sort=year&tab=records"), []);
    expect(r.records.toString()).toBe("taxon=a&sort=year");
  });
});

describe("exportParams", () => {
  const q: SearchQuery = { ...EMPTY_QUERY, agent: "x", tab: "parasite of", page: 4, cols: ["guid"] };

  it("covers every page of the records table, which the service knows as no tab", () => {
    const p = exportParams({ ...q, tab: "" }, "records");
    expect(p.has("tab")).toBe(false);
    expect(p.has("page")).toBe(false);
    expect(p.get("cols")).toBe("guid");
  });

  it("names a related table, whichever tab is open", () => {
    expect(exportParams(q, "host of parasite").get("tab")).toBe("host of parasite");
  });

  it("takes a column preset in place of the chosen columns", () => {
    expect(exportParams(q, "records", ["map"]).get("cols")).toBe("map");
  });
});

describe("toggleTaxon", () => {
  const genus = {
    rank: "genus",
    name: "Myodes",
    relations: ["host of parasite"],
    related: [{ rank: "class", name: "Cestoda" }],
  };
  const names = (q: SearchQuery) => q.taxa.map((t) => `${t.rank}|${t.name}`);

  it("narrows the row to a picked name, keeping its relationship and related taxa", () => {
    const q: SearchQuery = { ...structuredClone(EMPTY_QUERY), taxa: [structuredClone(genus)] };
    toggleTaxon(q, "Myodes gapperi", genus);
    expect(q.taxa).toEqual([{ ...genus, rank: "scientific_name", name: "Myodes gapperi" }]);
    expect(isPicked(q, "taxa", { value: "Myodes gapperi" })).toBe(true);
    expect(isPicked(q, "taxa", { value: "Myodes rutilus" })).toBe(false);
  });

  it("ORs further picks in, and widens back to the original row when the last is taken out", () => {
    const q: SearchQuery = { ...structuredClone(EMPTY_QUERY), taxa: [structuredClone(genus)] };
    toggleTaxon(q, "Myodes gapperi", genus);
    toggleTaxon(q, "Myodes rutilus", genus);
    expect(names(q)).toEqual(["scientific_name|Myodes gapperi", "scientific_name|Myodes rutilus"]);
    toggleTaxon(q, "Myodes gapperi", genus);
    expect(names(q)).toEqual(["scientific_name|Myodes rutilus"]);
    toggleTaxon(q, "Myodes rutilus", genus);
    expect(q.taxa).toEqual([genus]);
  });

  it("reaches the URL as scientific_name rows", () => {
    const q: SearchQuery = { ...structuredClone(EMPTY_QUERY), taxa: [structuredClone(genus)] };
    toggleTaxon(q, "Myodes gapperi", genus);
    expect(toParams(q).getAll("taxon")).toEqual(["scientific_name|Myodes gapperi|host of parasite|class|Cestoda"]);
  });
});

describe("canPickTaxon", () => {
  const row = (rank: string, name: string): TaxonPair => ({ rank, name, relations: [], related: [] });
  const with_ = (...taxa: ReturnType<typeof row>[]): SearchQuery => ({ ...structuredClone(EMPTY_QUERY), taxa });

  it("allows narrowing one named row", () => {
    expect(canPickTaxon(with_(row("genus", "Myodes")))).toBe(true);
  });

  it("refuses OR'd rows, a row already at the picked rank, and no taxon at all", () => {
    expect(canPickTaxon(with_(row("genus", "Myodes"), row("genus", "Sorex")))).toBe(false);
    expect(canPickTaxon(with_(row("genus", "Myodes"), { ...row("", ""), relations: ["host of parasite"] }))).toBe(
      false,
    );
    // a blank row, as "+ Add taxon" leaves, searches nothing
    expect(canPickTaxon(with_(row("genus", "Myodes"), row("genus", "")))).toBe(true);
    expect(canPickTaxon(with_(row("scientific_name", "Myodes gapperi")))).toBe(false);
    expect(canPickTaxon(with_())).toBe(false);
  });
});
