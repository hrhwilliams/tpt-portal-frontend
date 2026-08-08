import { EMPTY_QUERY, type AttributePair, type BoolOp, type SearchQuery, type TaxonPair } from "./types.ts";

/** Types that are allowed in the detection attribute form */
export const DETECTION_ATTRIBUTE_TYPE_IDS = new Set(["detected", "not detected", "examined for", "not examined for"]);

/**
 * `rank|name` or `rank|name|relation; relation`
 */
function decodeTaxon(raw: string): TaxonPair | null {
  // split by `|` into rank, name, relations list
  const [rank = "", name = "", rel = ""] = raw.split("|").map((s) => s.trim());

  if (!name) {
    return null;
  }

  // further split relations list separated by `;`
  const relations = rel
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
  return { rank, name, relations };
}

/**
 * `type|value; value`
 */
function decodeAttr(raw: string): AttributePair | null {
  let s = raw;
  let negated = false;

  if (s.startsWith("!")) {
    negated = true;
    s = s.slice(1);
  }

  // split on first `|` only to avoid splitting value fields that contain
  // their own pipes
  const cut = s.indexOf("|");
  const type = (cut < 0 ? s : s.slice(0, cut)).trim();
  const joined = cut < 0 ? "" : s.slice(cut + 1).trim();

  if (!type) {
    return null;
  }

  // split attribute value list separated by `;`
  const values = joined
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);

  return { type, values, negated };
}

/** Flattens the attribute lists into one list */
function allAttributes(q: SearchQuery): AttributePair[] {
  return [...q.detectionAttributes, ...q.otherAttributes];
}

/** Transform a query into a shareable URL parameter list */
export function toParams(q: SearchQuery): URLSearchParams {
  const p = new URLSearchParams();

  const put = (k: string, v: string) => {
    if (v && v.trim()) p.set(k, v.trim());
  };

  for (const t of q.taxa) {
    if (!t.name) continue;
    const rel = t.relations.filter(Boolean);
    p.append("taxon", `${t.rank}|${t.name}${rel.length ? `|${rel.join("; ")}` : ""}`);
  }

  for (const a of allAttributes(q)) {
    if (!a.type) continue;
    const v = a.values.map((x) => x.trim()).filter(Boolean);
    p.append("attr", `${a.negated ? "!" : ""}${a.type}${v.length ? `|${v.join("; ")}` : ""}`);
  }

  const typedAttrCount = allAttributes(q).filter((a) => a.type).length;

  if (q.attr_op === "or" && typedAttrCount > 1) {
    p.set("attr_op", "or");
  }

  if (!hasNegatedRow(q)) {
    put("method", q.method);
  }

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
  put("collector", q.agent);

  if (q.page > 1) {
    p.set("page", String(q.page));
  }

  return p;
}

/** Transform a URL parameter list into a search query for the search form */
export function fromParams(p: URLSearchParams): SearchQuery {
  const taxa = p
    .getAll("taxon")
    .map(decodeTaxon)
    .filter((t): t is TaxonPair => t !== null);

  if (taxa.length === 0) {
    const legacyName = p.get("taxon");
    if (legacyName && !legacyName.includes("|")) {
      taxa.push({ rank: p.get("rank") ?? "", name: legacyName, relations: [] });
    }
  }

  const attrs = p
    .getAll("attr")
    .map(decodeAttr)
    .filter((a): a is AttributePair => a !== null);

  const q: SearchQuery = {
    ...EMPTY_QUERY,
    taxa,
    detectionAttributes: attrs.filter((a) => DETECTION_ATTRIBUTE_TYPE_IDS.has(a.type)),
    otherAttributes: attrs.filter((a) => !DETECTION_ATTRIBUTE_TYPE_IDS.has(a.type)),
    attr_op: (p.get("attr_op") === "or" ? "or" : "and") as BoolOp,
    guid_prefixes: p.getAll("prefix").filter(Boolean),
    method: p.get("method") ?? "",
    locality: p.get("locality") ?? "",
    countries: p.getAll("country").filter(Boolean),
    states: p.getAll("state").filter(Boolean),
    collected_from: p.get("from") ?? "",
    collected_to: p.get("to") ?? "",
    agent: p.get("collector") ?? "",
    page: Math.max(1, Number(p.get("page") ?? 1) || 1),
  };

  if (hasNegatedRow(q)) q.method = "";

  return q;
}

/** Check if one of the attribute rows has had `NOT` checked */
export function hasNegatedRow(q: SearchQuery): boolean {
  return allAttributes(q).some((a) => a.negated && a.type);
}

/** Check if a search query is empty */
export function isEmpty(q: SearchQuery): boolean {
  return !(
    q.taxa.some((t) => t.name) ||
    q.guid_prefixes.length > 0 ||
    allAttributes(q).some((a) => a.type) ||
    q.locality ||
    q.countries.length > 0 ||
    q.states.length > 0 ||
    q.collected_from ||
    q.collected_to ||
    q.agent
  );
}
