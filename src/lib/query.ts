import {
  EMPTY_QUERY,
  type AttributePair,
  type BoolOp,
  type RelatedTaxon,
  type SearchQuery,
  type TaxonPair,
} from "./types.ts";

/** Types that are allowed in the detection attribute form */
export const DETECTION_ATTRIBUTE_TYPE_IDS = new Set(["detected", "not detected", "examined for", "not examined for"]);

/**
 * A `|` typed by the user is written as `\|`, so that the number of segments
 * always identifies the shape of the value. Doubling the pipe instead would be
 * ambiguous: a delimiter followed by an escaped pipe is indistinguishable from
 * an escaped pipe followed by a delimiter.
 */
export function escapePipes(s: string): string {
  return s.replace(/[\\|]/g, (c) => `\\${c}`);
}

/** Splits on `|`, honouring backslash escapes. */
export function splitPipes(raw: string): string[] {
  const out: string[] = [];
  let cur = "";

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\") {
      cur += raw[i + 1] ?? "";
      i++;
    } else if (raw[i] === "|") {
      out.push(cur);
      cur = "";
    } else {
      cur += raw[i];
    }
  }

  out.push(cur);
  return out;
}

/**
 * `rank|name`, `rank|name|relation; relation`, or that followed by a related
 * rank and name for each related taxon.
 */
function decodeTaxon(raw: string): TaxonPair | null {
  // split by `|` into rank, name, relations list, then related rank/name pairs
  const segments = splitPipes(raw).map((s) => s.trim());
  const [rank = "", name = "", rel = ""] = segments;

  // further split relations list separated by `;`
  const relations = rel
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);

  const related: RelatedTaxon[] = [];

  for (let i = 3; i + 1 < segments.length; i += 2) {
    if (segments[i + 1]) {
      related.push({ rank: segments[i], name: segments[i + 1] });
    }
  }

  // a row with no name of its own is still a search when it names the other side
  if (!name && !related.length) {
    return null;
  }

  return { rank, name, relations, related };
}

/**
 * `type|value|value`
 */
function decodeAttr(raw: string): AttributePair | null {
  let s = raw;
  let negated = false;

  if (s.startsWith("!")) {
    negated = true;
    s = s.slice(1);
  }

  const [type = "", ...rest] = splitPipes(s).map((v) => v.trim());

  if (!type) {
    return null;
  }

  const values = rest.filter(Boolean);

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
    const rel = t.relations.filter(Boolean);
    const related = t.related.filter((r) => r.name);

    // a row with no name of its own is still a search when it names the other side
    if (!t.name && !related.length) continue;
    const segments = [escapePipes(t.rank), escapePipes(t.name)];

    if (rel.length || related.length) {
      segments.push(rel.map(escapePipes).join("; "));
    }

    for (const r of related) {
      segments.push(escapePipes(r.rank), escapePipes(r.name));
    }

    p.append("taxon", segments.join("|"));
  }

  for (const a of allAttributes(q)) {
    if (!a.type) continue;
    const v = a.values.map((x) => x.trim()).filter(Boolean);
    const head = `${a.negated ? "!" : ""}${escapePipes(a.type)}`;
    p.append("attr", head + v.map((x) => `|${escapePipes(x)}`).join(""));
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
  put("tab", q.tab);

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
    tab: p.get("tab") ?? "",
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
    q.taxa.some((t) => t.name || t.related.some((r) => r.name)) ||
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
