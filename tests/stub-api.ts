/**
 * A stand-in for the search service, so the Playwright tests that only exercise
 * the form run without the real backend. It serves a saved copy of
 * `/api/duckdb/schema` and an empty result for every search. Tests needing real data
 * are tagged `@live` and run against the real service with `LIVE=1`.
 *
 * Refresh the fixture when the schema changes shape:
 *   curl https://ocellus.bnhm.berkeley.edu/arctos-reciprocal-relationship-portal/api/duckdb/schema > tests/fixtures/schema.json
 * (then trim `collectors`; the full list is ~2 MB)
 */
import { createServer } from "node:http";
import schema from "./fixtures/schema.json";

const empty = { matched: 0, distinct: { taxa: 0, localities: 0, collectors: 0 }, years: null };
const block = {
  ...empty,
  facets: {
    taxa: [],
    countries: [],
    states: [],
    collections: [],
    collectors: [],
    detections: [],
    attributes: [],
    parts: [],
  },
};

const taxa = [
  { rank: "genus", name: "Sorex", record_count: 82491, parent_rank: "subfamily", parent_name: "Soricinae" },
  { rank: "species", name: "Sorex cinereus", record_count: 26364, parent_rank: "genus", parent_name: "Sorex" },
];

const speciesFacet = [
  { value: "Sorex cinereus", count: 140 },
  { value: "Sorex monticolus", count: 52 },
];

// the first seven of what the service sends for genus Sorex
const sorexSynonyms = ["Amphimygale", "Amphiosorex", "Amphisorex", "Asorex", "Atophyrax", "Corsira", "Dolgovia"];

// as the service sent them on 2026-11-18, citations trimmed
const itis = {
  key: 2144,
  alias: "ITIS",
  title: "The Integrated Taxonomic Information System",
  version: "2026-10-28",
  doi: "10.48580/d4ky",
  citation: "Nicolson, D., et al. (2026). The Integrated Taxonomic Information System (Version 2026-10-28).",
};
const col = {
  key: 316691,
  alias: "COL26.10 XR",
  title: "Catalogue of Life",
  version: "2026-10-16 XR",
  doi: "10.48580/dgzlf",
  citation: "Bánki, O., et al. (2026). Catalogue of Life (2026-10-16 XR).",
};

const routes: Record<string, (url: URL) => unknown> = {
  "/api/duckdb/schema": () => schema,
  "/api/duckdb/search": () => ({ records: [], column_order: [], summary: { matched: 0 } }),
  "/api/duckdb/relations": () => ({ records: [], column_order: [], summary: { context: 0, matched: 0 } }),
  // the taxa facet narrows to the scientific names searched, as the service's does
  "/api/duckdb/summary": (url) => {
    const names = url.searchParams
      .getAll("taxon")
      .filter((t) => t.startsWith("scientific_name|"))
      .map((t) => t.split("|")[1]);
    const facet = names.length ? speciesFacet.filter((t) => names.includes(t.value)) : speciesFacet;
    const synonymsAsked = url.searchParams.get("synonyms") === "yes";
    // any other genus answers as a synonym of Sorex
    const searched = url.searchParams.get("taxon")?.split("|")[1] ?? "Sorex";
    return {
      records: { ...block, facets: { ...block.facets, taxa: facet } },
      related: [],
      description: synonymsAsked ? `Genus Sorex (also ${sorexSynonyms.join(", ")}).` : null,
      synonyms: synonymsAsked
        ? {
            taxa: [
              {
                name: searched,
                status: searched === "Sorex" ? "accepted" : "synonym",
                accepted: {
                  name: "Sorex",
                  authorship: "Linnaeus, 1758",
                  link: "https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=TSN&search_value=0",
                  source: 2144,
                  references: ["Hutterer, Rainer (2005). Order Soricomorpha. Mammal Species of the World, 3rd Ed."],
                },
                synonyms: sorexSynonyms.map((name) => ({ name, authorship: null, link: null, source: null })),
              },
            ],
            sources: [itis],
            release: col,
          }
        : null,
    };
  },
  "/api/duckdb/taxa": (url) => {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    return { matches: taxa.filter((t) => t.name.toLowerCase().startsWith(q)) };
  },
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = routes[url.pathname];

  if (!route) {
    res.writeHead(404).end("not stubbed");
    return;
  }

  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(route(url)));
}).listen(Number(process.env.PORT ?? 5174));
