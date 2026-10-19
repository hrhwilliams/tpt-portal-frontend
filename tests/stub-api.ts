/**
 * A stand-in for the search service, so the Playwright tests that only exercise
 * the form run without the real backend. It serves a saved copy of
 * `/api/schema` and an empty result for every search. Tests needing real data
 * are tagged `@live` and run against the real service with `LIVE=1`.
 *
 * Refresh the fixture when the schema changes shape:
 *   curl https://tpt-portal.fiatlux.dev/api/schema > tests/fixtures/schema.json
 * (then trim `collectors`; the full list is ~2 MB)
 */
import { createServer } from "node:http";
import schema from "./fixtures/schema.json";

const empty = { matched: 0, distinct: { taxa: 0, localities: 0, collectors: 0 }, years: null };
const block = { ...empty, facets: { taxa: [], countries: [], states: [], collections: [] } };

const taxa = [
  { rank: "genus", name: "Sorex", record_count: 82491, parent_rank: "subfamily", parent_name: "Soricinae" },
  { rank: "species", name: "Sorex cinereus", record_count: 26364, parent_rank: "genus", parent_name: "Sorex" },
];

const routes: Record<string, (url: URL) => unknown> = {
  "/api/schema": () => schema,
  "/api/search": () => ({ records: [], column_order: [], summary: { matched: 0 } }),
  "/api/relations": () => ({ records: [], column_order: [], summary: { context: 0, matched: 0 } }),
  "/api/summary": () => ({ records: block, related: [], description: null }),
  "/api/taxa": (url) => {
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
