import { EMPTY_QUERY, type AttributePair, type BoolOp, type SearchQuery, type TaxonPair } from "./types.ts";

/**
 * URL <-> query state. The URL is the state: nothing else drives a search.
 *
 * Both repeatable blocks serialise as repeated params:
 *
 *   taxon=species|Myodes gapperi
 *   taxon=species|Myodes rutilus     -> OR
 *   taxon=genus|Sorex|parasite of; host of parasite
 *                                    -> the row's relationships, OR within the row
 *   attr=examined for|ectoparasite
 *   attr=!detected|ectoparasite      -> `!` negates
 *   attr_op=or                       -> absent means AND
 *
 * Each decoder below documents how it splits its own `|`s.
 */

/**
 * `rank|name` or `rank|name|relation; relation`. Three controlled-ish fields, so
 * a plain split: a taxon name containing a `|` is theoretical, and its tail would
 * only land in the relations slot and match no relationship.
 */
function decodeTaxon(raw: string): TaxonPair | null {
  const [rank = "", name = "", rel = ""] = raw.split("|").map((s) => s.trim());
  if (!name) return null;
  const relations = rel
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
  return { rank, name, relations };
}

function decodeAttr(raw: string): AttributePair | null {
  let s = raw;
  let negated = false;
  if (s.startsWith("!")) {
    negated = true;
    s = s.slice(1);
  }
  // Split on the FIRST `|` only, and no `|` at all means no value: "carries this
  // attribute type at all". Free-text values routinely contain one — `reproductive
  // data` uses it as its own internal separator.
  const cut = s.indexOf("|");
  const type = (cut < 0 ? s : s.slice(0, cut)).trim();
  const joined = cut < 0 ? "" : s.slice(cut + 1).trim();
  if (!type) return null;
  // Several values OR within the row. `;` is safe as the separator: controlled
  // values never contain one, and free-text types are single-valued in the form.
  const values = joined
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
  return { type, values, negated };
}

export function toParams(q: SearchQuery): URLSearchParams {
  const p = new URLSearchParams();
  // empty inputs are absent, never `&locality=` — keeps a shared link canonical
  const put = (k: string, v: string) => {
    if (v && v.trim()) p.set(k, v.trim());
  };
  for (const t of q.taxa) {
    if (!t.name) continue;
    const rel = t.relations.filter(Boolean);
    p.append("taxon", `${t.rank}|${t.name}${rel.length ? `|${rel.join("; ")}` : ""}`);
  }
  for (const a of q.attributes) {
    if (!a.type) continue;
    const v = a.values.map((x) => x.trim()).filter(Boolean);
    p.append("attr", `${a.negated ? "!" : ""}${a.type}${v.length ? `|${v.join("; ")}` : ""}`);
  }
  // Rows without a type yet (just added, not chosen) don't count — otherwise
  // toggling OR before picking a type puts `attr_op=or` alone on the URL, which
  // reads as a submitted-but-empty search and gets rejected.
  const typedAttrCount = q.attributes.filter((a) => a.type).length;
  if (q.attr_op === "or" && typedAttrCount > 1) p.set("attr_op", "or");
  if (!hasNegatedRow(q)) put("method", q.method);
  for (const gp of q.guid_prefixes) {
    if (gp) p.append("prefix", gp);
  }
  put("locality", q.locality);
  for (const c of q.countries) {
    if (c) p.append("country", c);
  }
  for (const st of q.states) {
    if (st) p.append("state", st);
  }
  put("from", q.collected_from);
  put("to", q.collected_to);
  put("collector", q.collector_id);
  if (q.page > 1) p.set("page", String(q.page));
  if (q.sort !== "guid_asc") p.set("sort", q.sort);
  return p;
}

export function fromParams(p: URLSearchParams): SearchQuery {
  const taxa = p
    .getAll("taxon")
    .map(decodeTaxon)
    .filter((t): t is TaxonPair => t !== null);

  // Links published before the taxon block became repeatable used a single
  // `rank=` + `taxon=` pair. D17 makes shared URLs a public API, so they keep
  // working: read the old form as one row.
  if (!taxa.length) {
    const legacyName = p.get("taxon");
    if (legacyName && !legacyName.includes("|")) {
      taxa.push({ rank: p.get("rank") ?? "", name: legacyName, relations: [] });
    }
  }

  const q: SearchQuery = {
    ...EMPTY_QUERY,
    taxa,
    attributes: p
      .getAll("attr")
      .map(decodeAttr)
      .filter((a): a is AttributePair => a !== null),
    attr_op: (p.get("attr_op") === "or" ? "or" : "and") as BoolOp,
    guid_prefixes: p.getAll("prefix").filter(Boolean),
    method: p.get("method") ?? "",
    locality: p.get("locality") ?? "",
    countries: p.getAll("country").filter(Boolean),
    states: p.getAll("state").filter(Boolean),
    collected_from: p.get("from") ?? "",
    collected_to: p.get("to") ?? "",
    collector_id: p.get("collector") ?? "",
    page: Math.max(1, Number(p.get("page") ?? 1) || 1),
    sort: p.get("sort") ?? "guid_asc",
  };
  // a hand-edited link could carry both; the form cannot produce it
  if (hasNegatedRow(q)) q.method = "";
  return q;
}

export function hasNegatedRow(q: SearchQuery): boolean {
  return q.attributes.some((a) => a.negated && a.type);
}

export function isEmpty(q: SearchQuery): boolean {
  return !(
    q.taxa.some((t) => t.name) ||
    q.guid_prefixes.length > 0 ||
    q.attributes.some((a) => a.type) ||
    q.locality ||
    q.countries.length > 0 ||
    q.states.length > 0 ||
    q.collected_from ||
    q.collected_to ||
    q.collector_id
  );
}

/** Client-side mirror of the API's validation. The backend stays authoritative. */
export function validate(q: SearchQuery): string[] {
  const errors: string[] = [];
  if (isEmpty(q)) errors.push("Enter at least one filter — an unconstrained search is refused.");
  if (q.collected_from && q.collected_to && q.collected_from > q.collected_to)
    errors.push("Collection date range starts after it ends.");
  for (const t of q.taxa) {
    if (t.name && !t.rank) errors.push(`Taxon "${t.name}" has no rank.`);
  }
  // a row with no value is legal: "carries this attribute type at all"
  if (q.method && hasNegatedRow(q)) errors.push("Method cannot be combined with a negated attribute row.");
  return errors;
}
