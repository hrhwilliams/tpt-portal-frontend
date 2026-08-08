<script lang="ts">
  /**
   * Free-text field with local suggestions. `q.agent` matches as prose against
   * the whole collector-name field, so any typed text is a valid search — the
   * list only helps you find one, it never restricts you to one.
   */
  import type { CountedValue } from "$lib/types";

  let { value = $bindable(), options, id }: { value: string; options: CountedValue[]; id?: string } = $props();

  let open = $state(false);
  let active = $state(-1);

  const listId = $derived(`${id ?? "collector"}-list`);

  // The full list is already in memory (it rode in on the schema fetch), so
  // filtering here is a plain array scan — no debounce or network round trip
  // needed, unlike TaxonCombobox's `/api/taxa` lookup.
  const matches = $derived.by(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    return options
      .filter((o) => o.value.toLowerCase().includes(q) && o.value.toLowerCase() !== q)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  });

  function choose(o: CountedValue) {
    value = o.value;
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
    placeholder="Any collector name"
    role="combobox"
    aria-expanded={open && matches.length > 0}
    aria-controls={listId}
    aria-autocomplete="list"
  />

  {#if open && matches.length}
    <ul class="floating-panel" id={listId} role="listbox">
      {#each matches as m, i (m.value)}
        <li role="option" aria-selected={i === active}>
          <button
            type="button"
            class:active={i === active}
            onmousedown={() => choose(m)}
            onmouseenter={() => (active = i)}
          >
            <span class="name">{m.value}</span>
            <span class="meta">{m.count.toLocaleString()}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if open && value.trim().length >= 2}
    <ul class="floating-panel" id={listId} role="listbox">
      <li class="none">No collector matching that in this snapshot. You can still search for it.</li>
    </ul>
  {/if}
</div>

<!-- .combo, the floating panel, and the option-list styling are all global —
     see +layout.svelte. Shared with TaxonCombobox. -->
