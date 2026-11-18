import { describe, expect, it } from "vitest";
import { facetRows, filterKey } from "./facets.ts";
import { EMPTY_QUERY, type SearchQuery } from "./types.ts";

const q = (over: Partial<SearchQuery> = {}): SearchQuery => ({ ...structuredClone(EMPTY_QUERY), ...over });
const values = (rows: { value: string }[]) => rows.map((r) => r.value);

describe("facetRows", () => {
  it("lists an unpickable facet by count", () => {
    const rows = facetRows([
      { value: "a", count: 1 },
      { value: "b", count: 5 },
    ]);
    expect(values(rows)).toEqual(["b", "a"]);
    expect(rows.some((r) => r.picked || r.gone)).toBe(false);
  });

  it("puts picked values first, then matched, then those only the base still has", () => {
    const rows = facetRows(
      [
        { value: "Canada", count: 3 },
        { value: "Mexico", count: 9 },
      ],
      {
        query: q({ countries: ["Canada"] }),
        facet: "countries",
        base: [
          { value: "Peru", count: 50 },
          { value: "Canada", count: 40 },
          { value: "Mexico", count: 30 },
        ],
      },
    );
    expect(rows).toEqual([
      { value: "Canada", count: 3, picked: true },
      { value: "Mexico", count: 9 },
      { value: "Peru", count: 50, gone: true },
    ]);
  });

  it("keeps values the base never had", () => {
    const rows = facetRows([{ value: "Chile", count: 2 }], {
      query: q(),
      facet: "countries",
      base: [{ value: "Peru", count: 50 }],
    });
    expect(values(rows)).toEqual(["Chile", "Peru"]);
  });

  it("tells typed values of the same name apart", () => {
    const rows = facetRows([{ type: "detected", value: "Hantavirus", count: 1 }], {
      query: q(),
      facet: "detections",
      base: [
        { type: "detected", value: "Hantavirus", count: 4 },
        { type: "examined for", value: "Hantavirus", count: 7 },
      ],
    });
    expect(rows.map((r) => [r.type, r.count, !!r.gone])).toEqual([
      ["detected", 1, false],
      ["examined for", 7, true],
    ]);
  });
});

describe("filterKey", () => {
  it("ignores the open table, its page and its columns", () => {
    expect(filterKey(q({ agent: "x", tab: "records", page: 3, cols: ["guid"] }))).toBe(filterKey(q({ agent: "x" })));
  });

  it("changes with any filter", () => {
    expect(filterKey(q({ agent: "x" }))).not.toBe(filterKey(q({ agent: "y" })));
  });
});
