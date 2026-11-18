import type { Summary } from "$lib/types";

/** A run of the description; a synonym carries the 1-based numbers of the sources listing it. */
export type DescriptionPart = { text: string; refs?: number[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the backend's "(or its synonyms A, B)" wording; one nesting level for subgenera like "Sorex (Otisorex) cinereus"
const BRACKET = /(\(or its synonyms? (?:[^()]|\([^()]*\))*\))/;

/**
 * Splits the description around each added synonym, looking only inside the
 * synonym brackets. The release (first source) lists every name, so it is
 * cited only for names no dataset supplied.
 */
export function footnote(description: string, sources: Summary["sources"]): DescriptionPart[] {
  const refs = new Map<string, number[]>();
  sources.forEach((s, i) => {
    if (i === 0) return;
    for (const name of s.names) refs.set(name, [...(refs.get(name) ?? []), i + 1]);
  });
  for (const name of sources[0]?.names ?? []) if (!refs.has(name)) refs.set(name, [1]);
  if (!refs.size) return [{ text: description }];

  // longest first, so "Sorex araneus" wins over "Sorex"
  const names = [...refs.keys()].sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.join("|")})(?![\\p{L}\\p{N}])`, "u");
  const mark = (s: string) => s.split(re).map((text, i) => (i % 2 ? { text, refs: refs.get(text) } : { text }));
  return description
    .split(BRACKET)
    .flatMap((s, i) => (i % 2 ? mark(s) : [{ text: s }]))
    .filter((p) => p.text);
}
