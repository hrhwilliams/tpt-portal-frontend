<script lang="ts">
  import { getTaxa } from "$lib/api";
  import type { Taxon } from "$lib/types";

  let { value = $bindable(), rank, id }: { value: string; rank: string; id?: string } = $props();

  let open = $state(false);
  let active = $state(-1);
  let matches = $state<Taxon[]>([]);
  let answered = $state("");
  const listId = $derived(`${id ?? "taxon"}-list`);

  // GET /api/taxa. One request per keystroke is what the debounce and the abort
  // are for — this is the endpoint users hit hardest, and typing is bursty.
  $effect(() => {
    const q = value.trim();
    const r = rank;
    if (q.length < 2) {
      matches = [];
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        matches = await getTaxa(fetch, q, { rank: r, signal: ctl.signal });
        active = -1;
        answered = q;
      } catch {
        // an aborted or failed lookup leaves the last suggestions up rather than
        // blanking the list — the field is free text and works without them
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  });

  function choose(t: Taxon) {
    value = t.name;
    open = false;
    active = -1;
  }

  function onkeydown(e: KeyboardEvent) {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      active = (active + 1) % matches.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + matches.length) % matches.length;
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      open = false;
      active = -1;
    }
  }
</script>

<div class="combo">
  <input
    {id}
    type="text"
    autocomplete="off"
    bind:value
    {onkeydown}
    oninput={() => {
      open = true;
      active = -1;
    }}
    onblur={(e) => {
      // not a timeout race with the option's mousedown: closing only when focus
      // actually left the combobox lets the click land on its own
      if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) open = false;
    }}
    placeholder="e.g. Sorex"
    role="combobox"
    aria-expanded={open && matches.length > 0}
    aria-controls={listId}
    aria-autocomplete="list"
  />

  {#if open && matches.length}
    <ul class="floating-panel" id={listId} role="listbox">
      {#each matches as t, i (t.rank + t.name)}
        <li role="option" aria-selected={i === active}>
          <button
            type="button"
            class:active={i === active}
            onmousedown={() => choose(t)}
            onmouseenter={() => (active = i)}
          >
            <span class="name">{t.name}</span>
            <!-- count only: rank and parent restate this source's classification,
						     which invites argument the portal has no way to settle -->
            <span class="meta">{t.record_count.toLocaleString()}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if open && value.trim().length >= 2 && answered === value.trim()}
    <ul class="floating-panel" id={listId} role="listbox">
      <li class="none">No taxon matching that in this snapshot. You can still search for it.</li>
    </ul>
  {/if}
</div>

<!-- .combo, the floating panel, and the option-list styling are all global —
     see +layout.svelte. Shared with CollectorCombobox. -->
