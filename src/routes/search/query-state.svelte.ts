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

      const timer = setTimeout(() => {
        // the Search button may have sent it already
        if (params.toString() !== this.#lastSent) {
          this.#navigate(params, { replaceState: true, keepFocus: true, noScroll: true });
        }
      }, 500);
      return () => clearTimeout(timer);
    });
  }

  /** Whether the query uses advanced settings */
  #usesAdvanced(s: SearchQuery): boolean {
    return hasNegatedRow(s) || s.parts.some((a) => a.negated) || s.attr_op === "or" || s.method.trim() !== "";
  }

  #navigate(params: URLSearchParams, opts?: Parameters<typeof goto>[1]) {
    this.#query.page = Number(params.get("page") ?? 1) || 1;
    this.#lastSent = params.toString();

    return goto(resolve(`/search?${this.#lastSent}`), opts);
  }

  /** Sends the query now rather than after the live search's delay; resolves once the results are shown. */
  async search() {
    const params = toParams(this.#query);
    params.delete("page");

    if (params.toString() !== this.#lastSent) {
      await this.#navigate(params, { keepFocus: true, noScroll: true });
    }
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
      this.#query.parts = clear(this.#query.parts);
      this.#query.attr_op = "and";
      this.#query.method = "";
    }
  }

  /** Each tab pages separately, so a page number from the other one is meaningless. */
  setTab(tab: string) {
    this.#query.tab = tab;
    this.#query.page = 1;
    this.#navigate(toParams(this.#query), { noScroll: true });
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
