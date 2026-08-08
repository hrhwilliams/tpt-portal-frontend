# TPT specimen search portal — frontend

Public search over natural history specimen records from Arctos. SvelteKit,
statically hosted, talking to a Rust + Elasticsearch service.

```sh
npm install
npm run dev        # http://localhost:5173
```

**That service must be running** at the address in `vite.config.ts`
(`__API_BASE__`, `http://localhost:2334` by default) — not only to search, but to
render the form at all: its vocabularies come from `GET /api/schema` and its
taxon suggestions from `GET /api/taxa`. Submitting is a navigation; `load`
forwards the URL's query string to `GET /api/search`.

## Docs

|                                    |                                                                 |
| ---------------------------------- | --------------------------------------------------------------- |
| [docs/DESIGN.md](docs/DESIGN.md)   | What is being built and why. Start here                         |
| [docs/BUILD.md](docs/BUILD.md)     | How to run it, the conventions, what to do next                 |
| [docs/specs/](docs/specs/)         | Detail: mapping, API contracts, the data validation behind both |
| [tools/README.md](tools/README.md) | Profilers and the code-table fetcher                            |
