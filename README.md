# TPT specimen search portal — frontend

Public search over natural history specimen records from Arctos. SvelteKit,
statically hosted, talking to a Rust + Elasticsearch service that does not exist
yet.

```sh
npm install
npm run dev        # http://localhost:5173
npm run verify     # asserts the URL -> Elasticsearch translation
```

A search currently stops at the query it would send and renders it — there is no
backend to answer it.

## Docs

| | |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | What is being built and why. Start here |
| [docs/BUILD.md](docs/BUILD.md) | How to run it, what a fixture is, what to do next |
| [docs/specs/](docs/specs/) | Detail: mapping, API contracts, the data validation behind both |
| [tools/README.md](tools/README.md) | Profilers and the fixture generator |
