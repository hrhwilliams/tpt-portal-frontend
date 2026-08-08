<script lang="ts">
  export type Option = { value: string; label: string; hint?: string };

  let {
    selected = $bindable(),
    options,
    placeholder = "Select...",
    filterPlaceholder = "Type to filter...",
    id,
  }: {
    selected: string[];
    options: Option[];
    placeholder?: string;
    filterPlaceholder?: string;
    id: string;
  } = $props();

  let open = $state(false);
  let filter = $state("");
  let root: HTMLDivElement | undefined = $state();

  const shown = $derived.by(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return options;
    return options.filter((o) => o.label.toLowerCase().includes(f) || o.value.toLowerCase().includes(f));
  });

  const checked = $derived(shown.filter((o) => selected.includes(o.value)));
  const unchecked = $derived(shown.filter((o) => !selected.includes(o.value)));

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const label = $derived(
    selected.length === 0
      ? placeholder
      : selected.slice(0, 2).map(labelOf).join(", ") + (selected.length > 2 ? ", …" : ""),
  );

  function toggle(value: string) {
    selected = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  }

  function close() {
    open = false;
    filter = "";
  }

  function onDocPointerDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) {
      close();
    }
  }

  function onDocKeyDown(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      close();
    }
  }
</script>

<svelte:document onpointerdown={onDocPointerDown} onkeydown={onDocKeyDown} />

<div class="ms" bind:this={root}>
  <button
    type="button"
    class="trigger"
    aria-expanded={open}
    aria-controls={`${id}-list`}
    onclick={() => (open = !open)}
  >
    <span class="label" class:placeholder={selected.length === 0}>{label}</span>
    {#if selected.length > 1}<span class="badge">{selected.length}</span>{/if}
    <span class="caret" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div class="panel floating-panel" id={`${id}-list`}>
      <div class="bar">
        <input
          type="text"
          class="filter"
          autocomplete="off"
          {@attach (el) => el.focus()}
          bind:value={filter}
          placeholder={filterPlaceholder}
        />
        {#if selected.length}
          <button type="button" class="clear" onclick={() => (selected = [])}>Clear all</button>
        {/if}
      </div>
      {#snippet row(o: Option)}
        <li>
          <label>
            <input type="checkbox" checked={selected.includes(o.value)} onchange={() => toggle(o.value)} />
            <span class="txt">{o.label}</span>
            {#if o.hint}<span class="hint">{o.hint}</span>{/if}
          </label>
        </li>
      {/snippet}

      <ul>
        {#each checked as o (o.value)}{@render row(o)}{/each}
        {#if checked.length && unchecked.length}
          <li class="sep"><hr /></li>
        {/if}
        {#each unchecked as o (o.value)}{@render row(o)}{/each}
        {#if !shown.length}
          <li class="none">No match for "{filter}"</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .ms {
    position: relative;
  }
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    background: var(--bg);
    padding: 0.35rem 0.45rem;
  }
  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label.placeholder {
    color: var(--muted);
  }
  .badge {
    font-size: 0.72rem;
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 0.05rem 0.45rem;
  }
  .caret {
    color: var(--muted);
    font-size: 0.7rem;
  }
  .panel {
    margin-top: 2px;
    padding: 0.4rem;
    max-height: 16rem;
    display: flex;
    flex-direction: column;
    min-width: max(100%, 18rem);
  }
  .bar {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }
  .filter {
    flex: 1;
    min-width: 0;
  }
  .clear {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0.4rem 0 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  .ms li label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0.22rem 0.3rem;
    cursor: pointer;
    border-radius: 4px;
  }
  .ms li label:hover {
    background: var(--accent-soft);
  }
  .txt {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .sep hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 0.3rem 0;
  }
  .none {
    padding: 0.3rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
