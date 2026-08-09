import { untrack } from "svelte";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { hasNegatedRow, toParams } from "$lib/query";
import { EMPTY_QUERY, type SearchQuery } from "$lib/types";

export class SearchQueryState {
  #query = $state<SearchQuery>(EMPTY_QUERY);
  #advanced = $state(false);
  #lastSent: string;

  constructor(getQuery: () => SearchQuery) {
    this.#query = untrack(() => structuredClone(getQuery()));
    this.#advanced = untrack(() => this.#usesAdvanced(getQuery()));
    this.#lastSent = untrack(() => toParams(getQuery()).toString());

    // When a user navigates by pasting a URL, parse those params into the query
    // state
    $effect(() => {
      const incoming = toParams(getQuery()).toString();
      if (incoming === this.#lastSent) return;
      this.#query = structuredClone(getQuery());
      this.#advanced = this.#usesAdvanced(getQuery());
      this.#lastSent = incoming;
    });

    // Live search
    $effect(() => {
      const params = toParams(this.#query);
      if (params.toString() === this.#lastSent) {
        return;
      }

      params.delete("page");

      const timer = setTimeout(
        () => this.#navigate(params, { replaceState: true, keepFocus: true, noScroll: true }),
        500,
      );
      return () => clearTimeout(timer);
    });
  }

  /** Whether the query uses advanced settings */
  #usesAdvanced(s: SearchQuery): boolean {
    return hasNegatedRow(s) || s.attr_op === "or" || s.method.trim() !== "";
  }

  #navigate(params: URLSearchParams, opts?: Parameters<typeof goto>[1]) {
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

  /** Prevent hidden inputs from affecting the query */
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

    if (n > 1) {
      params.set("page", String(n));
    } else {
      params.delete("page");
    }

    this.#navigate(params, { noScroll: true });
  }

  reset() {
    this.#query = structuredClone(EMPTY_QUERY);
    this.#advanced = false;
    this.#navigate(toParams(this.#query));
  }
}
