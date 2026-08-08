<script lang="ts">
  import type { CountedValue } from "$lib/types";

  let { value = $bindable(), options, id }: { value: string; options: CountedValue[]; id?: string } = $props();

  let open = $state(false);
  let active = $state(-1);
  const listId = $derived(`${id ?? "collector"}-list`);

  const matches = $derived.by(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    return options
      .filter((o) => o.value.toLowerCase().includes(q))
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
      <li class="none">No match.</li>
    </ul>
  {/if}
</div>
