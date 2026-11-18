import type { Synonymy } from "./types.ts";

/** A run of the description, or the synonyms of a long list hidden behind a count. */
export type DescriptionPart = { text: string } | { hidden: string[] };

/**
 * Shortens each long synonym list in the description to its first `keep` names.
 * A list is found by its names as `synonymy` sends them; one not in the
 * description exactly so stays whole, so a change in wording costs only the
 * abbreviation.
 */
export function abbreviate(description: string, synonymy: Synonymy | null, keep = 5): DescriptionPart[] {
  let parts: DescriptionPart[] = [{ text: description }];

  for (const t of synonymy?.taxa ?? []) {
    // a searched synonym is named as itself, not in its own list
    const names = t.synonyms.map((s) => s.name).filter((n) => n !== t.name);
    if (names.length <= keep) continue;

    const list = names.join(", ");
    parts = parts.flatMap((p) => {
      const at = "text" in p ? p.text.indexOf(list) : -1;
      if (!("text" in p) || at < 0) return [p];
      return [
        { text: p.text.slice(0, at) + names.slice(0, keep).join(", ") },
        { hidden: names.slice(keep) },
        { text: p.text.slice(at + list.length) },
      ];
    });
  }

  return parts.filter((p) => !("text" in p) || p.text);
}
