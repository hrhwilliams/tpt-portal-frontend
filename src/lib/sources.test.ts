import { describe, expect, it } from "vitest";
import { footnote } from "./sources";

const src = (key: number, names: string[]) => ({ key, title: `t${key}`, names });

describe("footnote", () => {
  it("cites each dataset listing a synonym, and the release only for names no dataset supplied", () => {
    const description = "Genus Myodes (or its synonyms Clethrionomys, Evotomys).";
    const parts = footnote(description, [
      src(1, ["Clethrionomys", "Evotomys"]),
      src(2, ["Clethrionomys"]),
      src(3, ["Clethrionomys"]),
    ]);
    expect(parts.filter((p) => p.refs)).toEqual([
      { text: "Clethrionomys", refs: [2, 3] },
      { text: "Evotomys", refs: [1] },
    ]);
    expect(parts.map((p) => p.text).join("")).toBe(description);
  });

  it("matches whole names only, preferring the longer one", () => {
    const parts = footnote("Genus X (or its synonyms Sorexia, Sorex araneus, Sorex).", [
      src(1, ["Sorex", "Sorex araneus"]),
    ]);
    expect(parts.filter((p) => p.refs).map((p) => p.text)).toEqual(["Sorex araneus", "Sorex"]);
  });

  it("marks names only inside the synonym brackets, including ones with a subgenus", () => {
    const parts = footnote(
      "Genus Ognevia collected by Ognevia (or its synonym Sorex (Otisorex) cinereus) and genus Ognevia (or its synonyms Ognevia).",
      [src(1, ["Ognevia", "Sorex (Otisorex) cinereus"])],
    );
    expect(parts.filter((p) => p.refs).map((p) => p.text)).toEqual(["Sorex (Otisorex) cinereus", "Ognevia"]);
    expect(parts.map((p) => p.text).join("")).toContain("Genus Ognevia collected by Ognevia (or its synonym ");
  });

  it("leaves the description whole without sources", () => {
    expect(footnote("Genus Sorex.", [])).toEqual([{ text: "Genus Sorex." }]);
  });
});
