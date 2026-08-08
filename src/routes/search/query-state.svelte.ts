import { untrack } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { resolve } from "$app/paths";
import { hasNegatedRow, toParams } from "$lib/query";
import { EMPTY_QUERY, type SearchQuery } from "$lib/types";

/**
 * Owns the local edit buffer, keeps it synced with the URL, and does the
 * debounced live-search navigation. This is the one place that must know
 * `lastSent` — the params of the last navigation *this instance* sent, vs.
 * one landing from outside (back/forward, a pasted link, paging). Comparing
 * against the current query instead would misfire: an edit can still be in
 * flight (mid-debounce, or mid-request) when an earlier navigation lands,
 * and treating that stale response as "external" would wipe out the newer
 * edit — this collapsed two bugs that shipped from exactly that mix-up.
 */
export class SearchQueryState {
  #query = $state<SearchQuery>(EMPTY_QUERY);
  #advanced = $state(false);
  // Plain, not $state: only ever read `untrack`d in spirit (see #reconcile),
  // and reacting to writes here — which happen well before a navigation
  // resolves — would re-run reconciliation against the still-old query.
  #lastSent: string;

  constructor(getQuery: () => SearchQuery) {
    this.#query = untrack(() => structuredClone(getQuery()));
    this.#advanced = untrack(() => this.#usesAdvanced(getQuery()));
    this.#lastSent = untrack(() => toParams(getQuery()).toString());

    // Adopt the URL's query whenever a navigation we did not send lands.
    $effect(() => {
      const incoming = toParams(getQuery()).toString();
      if (incoming === this.#lastSent) return;
      this.#query = structuredClone(getQuery());
      this.#advanced = this.#usesAdvanced(getQuery());
      this.#lastSent = incoming;
    });

    // Live search: an edit navigates and `load` fetches. Debounced — typing a
    // locality would otherwise be one Elasticsearch query per keystroke,
    // against a 30 req/min per-IP limit. `replaceState` keeps the back button
    // on whole searches instead of every intermediate keystroke.
    $effect(() => {
      const params = toParams(this.#query);
      if (params.toString() === page.url.searchParams.toString()) return;
      // Only an edit gets past that early return — paging navigates directly
      // via `goPage`, which this effect never sees because `#navigate` (see
      // below) keeps `#query.page` matching whatever was last sent. Page 7 of
      // the old search is not page 7 of the new one, so an edit starts over
      // at the first: dropped from the target here rather than left for
      // `#navigate` to pick up from `#query.page`.
      params.delete("page");
      const timer = setTimeout(
        () => this.#navigate(params, { replaceState: true, keepFocus: true, noScroll: true }),
        500,
      );
      return () => clearTimeout(timer);
    });
  }

  /** Opens itself when a shared link already uses one of these, so a pasted
   *  URL never hides part of its own query. */
  #usesAdvanced(s: SearchQuery): boolean {
    return hasNegatedRow(s) || s.attr_op === "or" || s.method.trim() !== "";
  }

  #navigate(params: URLSearchParams, opts?: Parameters<typeof goto>[1]) {
    // Every outgoing navigation goes through here, so this is also the one
    // place that keeps `#query.page` matching what was actually sent. Without
    // it, `#query.page` stays stale after `goPage()`, the live-search effect
    // above sees `toParams(#query)` disagree with the URL it just landed on,
    // and "corrects" that by navigating straight back to page 1.
    this.#query.page = Number(params.get("page") ?? 1) || 1;
    this.#lastSent = params.toString();
    goto(resolve(`/search?${this.#lastSent}`), opts);
  }

  get query() {
    return this.#query;
  }

  get advanced() {
    return this.#advanced;
  }

  /** Hidden inputs must not keep filtering. Switching off discards them. */
  toggleAdvanced(on: boolean) {
    this.#advanced = on;
    if (!on) {
      const clear = (attrs: SearchQuery["detectionAttributes"]) => attrs.map((a) => ({ ...a, negated: false }));
      this.#query.detectionAttributes = clear(this.#query.detectionAttributes);
      this.#query.otherAttributes = clear(this.#query.otherAttributes);
      this.#query.attr_op = "and";
      this.#query.method = "";
    }
  }

  goPage(n: number) {
    const params = toParams(this.#query);
    if (n > 1) params.set("page", String(n));
    this.#navigate(params);
  }

  reset() {
    // #navigate only tells the reconciliation effect it sent this exact URL —
    // it no longer resyncs `#query` for us, so clear it here too.
    this.#query = structuredClone(EMPTY_QUERY);
    this.#advanced = false;
    this.#navigate(toParams(this.#query));
  }
}
