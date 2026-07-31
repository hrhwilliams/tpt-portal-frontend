# TPT specimen search portal — frontend

Public search over natural history specimen records from Arctos. SvelteKit,
statically hosted, talking to a Rust + Elasticsearch service.

```sh
npm install
npm run dev        # http://localhost:5173
```

Searching needs that service running at the address in `vite.config.ts`
(`__API_BASE__`, `http://localhost:2334` by default). Submitting the form is a
navigation; `load` forwards the URL's query string to `GET /api/search`.

## Docs

|                                    |                                                                 |
| ---------------------------------- | --------------------------------------------------------------- |
| [docs/DESIGN.md](docs/DESIGN.md)   | What is being built and why. Start here                         |
| [docs/BUILD.md](docs/BUILD.md)     | How to run it, what a fixture is, what to do next               |
| [docs/specs/](docs/specs/)         | Detail: mapping, API contracts, the data validation behind both |
| [tools/README.md](tools/README.md) | Profilers and the fixture generator                             |
