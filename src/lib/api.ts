import type { Schema, Taxon } from "./types.ts";

export async function getSchema(fetch: typeof globalThis.fetch): Promise<Schema> {
  let res: Response;

  try {
    res = await fetch(`${__API_BASE__}/api/schema`);
  } catch {
    throw new Error(`Could not load the search form from ${__API_BASE__}.`);
  }

  if (!res.ok) {
    throw new Error(`Could not load the search form from ${__API_BASE__}.`);
  }

  return (await res.json()) as Schema;
}

export async function search(
  fetch: typeof globalThis.fetch,
  params: URLSearchParams,
): Promise<{ records: Record<string, unknown>[]; matched: number }> {
  return searchPath(fetch, "search", params);
}

/**
 * The records the matched records are related to. Same query, same envelope,
 * paged on its own.
 */
export async function searchRelations(
  fetch: typeof globalThis.fetch,
  params: URLSearchParams,
): Promise<{ records: Record<string, unknown>[]; matched: number }> {
  return searchPath(fetch, "relations", params);
}

async function searchPath(
  fetch: typeof globalThis.fetch,
  path: string,
  params: URLSearchParams,
): Promise<{ records: Record<string, unknown>[]; matched: number }> {
  let res: Response;

  try {
    res = await fetch(`${__API_BASE__}/api/${path}?${params}`);
  } catch {
    throw new Error(`Could not reach the search service at ${__API_BASE__}.`);
  }

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body?.message ?? `Search failed (${res.status}).`);
  }

  return { records: body.records, matched: body.summary.matched };
}

export async function getTaxa(
  fetch: typeof globalThis.fetch,
  q: string,
  opts: { rank?: string; signal?: AbortSignal } = {},
): Promise<Taxon[]> {
  const rankParam = opts.rank ? `&rank=${encodeURIComponent(opts.rank)}` : "";

  const res = await fetch(`${__API_BASE__}/api/taxa?q=${encodeURIComponent(q)}&limit=10${rankParam}`, {
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`Taxa lookup failed (${res.status}).`);
  }

  const body = await res.json();
  return body.matches as Taxon[];
}

export function downloadUrl(params: URLSearchParams): string {
  return `${__API_BASE__}/api/download?${params}`;
}

/** The BerkeleyMapper XML config describing the export's columns. */
export function berkeleyMapperConfigUrl(): string {
  return `${__API_BASE__}/api/berkeleymapper.xml`;
}
