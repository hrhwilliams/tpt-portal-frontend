import { describe, expect, it } from "vitest";
import { abbreviate } from "./description.ts";
import type { Synonymy } from "./types.ts";

const name = (n: string) => ({ name: n, authorship: null, link: null, source: null });
const synonymy = (...taxa: [string, string[]][]): Synonymy => ({
  taxa: taxa.map(([n, syns]) => ({ name: n, status: "accepted", accepted: null, synonyms: syns.map(name) })),
  sources: [],
  release: {
    key: 316691,
    alias: "COL26.10 XR",
    title: "Catalogue of Life",
    version: "2026-10-16 XR",
    doi: null,
    citation: "",
  },
});
const shown = (parts: ReturnType<typeof abbreviate>) =>
  parts.map((p) => ("hidden" in p ? `[${p.hidden.length}]` : p.text)).join("");

const SOREX = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"];

describe("abbreviate", () => {
  it("keeps the first five synonyms and hides the rest", () => {
    const parts = abbreviate(`Genus Sorex (also ${SOREX.join(", ")}).`, synonymy(["Sorex", SOREX]));
    expect(shown(parts)).toBe("Genus Sorex (also A1, A2, A3, A4, A5[2]).");
    expect(parts.find((p) => "hidden" in p)).toEqual({ hidden: ["A6", "A7"] });
  });

  it("leaves a list of five or fewer whole", () => {
    const d = "Genus Myodes (also B1, B2, B3, B4, B5).";
    expect(abbreviate(d, synonymy(["Myodes", ["B1", "B2", "B3", "B4", "B5"]]))).toEqual([{ text: d }]);
  });

  it("leaves out the searched name when it is itself a synonym", () => {
    const d = `Genus Clethrionomys (accepted as Myodes; also ${SOREX.join(", ")}).`;
    expect(shown(abbreviate(d, synonymy(["Clethrionomys", ["Clethrionomys", ...SOREX]])))).toBe(
      "Genus Clethrionomys (accepted as Myodes; also A1, A2, A3, A4, A5[2]).",
    );
  });

  it("abbreviates each searched taxon's list", () => {
    const other = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];
    const d = `Genus Sorex (also ${SOREX.join(", ")}), or genus Myodes (also ${other.join(", ")}).`;
    expect(shown(abbreviate(d, synonymy(["Sorex", SOREX], ["Myodes", other])))).toBe(
      "Genus Sorex (also A1, A2, A3, A4, A5[2]), or genus Myodes (also C1, C2, C3, C4, C5[3]).",
    );
  });

  it("shows the description whole when the list is not in it as sent", () => {
    const d = "Genus Sorex (also A7, A6, A5, A4, A3, A2, A1).";
    expect(abbreviate(d, synonymy(["Sorex", SOREX]))).toEqual([{ text: d }]);
    expect(abbreviate(d, null)).toEqual([{ text: d }]);
  });
});
