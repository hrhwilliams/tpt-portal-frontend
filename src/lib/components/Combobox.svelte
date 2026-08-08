<script module lang="ts">
  export type Match = { key: string; label: string; count: number };
</script>

<script lang="ts">
  let {
    value = $bindable(),
    id,
    placeholder,
    noMatchText = "No match.",
    minLength = 2,
    search,
  }: {
    value: string;
    id?: string;
    placeholder?: string;
    noMatchText?: string;
    minLength?: number;
    search: (query: string, signal: AbortSignal) => Match[] | Promise<Match[]>;
  } = $props();

  const DEBOUNCE_MS = 200;

  let open = $state(false);
  let active = $state(-1);
  let matches = $state<Match[]>([]);
  let pending = $state(false);
  const listId = $derived(`${id ?? "combo"}-list`);

  $effect(() => {
    const q = value.trim();
    if (q.length < minLength) {
      matches = [];
      pending = false;
      return;
    }
    pending = true;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        matches = await search(q, ctl.signal);
        active = -1;
      } catch {
        // fine if this fails
      } finally {
        if (!ctl.signal.aborted) pending = false;
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  });

  function choose(m: Match) {
    value = m.label;
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
    {placeholder}
    role="combobox"
    aria-expanded={open && matches.length > 0}
    aria-controls={listId}
    aria-autocomplete="list"
  />

  {#if open && matches.length}
    <ul class="floating-panel" id={listId} role="listbox">
      {#each matches as m, i (m.key)}
        <li role="option" aria-selected={i === active}>
          <button
            type="button"
            class:active={i === active}
            onmousedown={() => choose(m)}
            onmouseenter={() => (active = i)}
          >
            <span class="name">{m.label}</span>
            <span class="meta">{m.count.toLocaleString()}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if open && !pending && value.trim().length >= minLength}
    <ul class="floating-panel" id={listId} role="listbox">
      <li class="none">{noMatchText}</li>
    </ul>
  {/if}
</div>
