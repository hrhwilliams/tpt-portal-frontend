<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import { resolve } from "$app/paths";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<header>
  <a class="brand" href={resolve("/")}>TPT specimen portal</a>
  <nav><a href={resolve("/search")}>Search</a></nav>
</header>

<main>
  {@render children()}
</main>

<style>
  :global(:root) {
    --bg: #ffffff;
    --panel: #f7f7f5;
    --line: #d8d6d1;
    --fg: #1b1a18;
    --muted: #6a6862;
    --accent: #3b6ea5;
    --accent-soft: #dbe7f3;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #16181a;
      --panel: #1e2124;
      --line: #34383d;
      --fg: #e7e5e1;
      --muted: #9a9891;
      --accent: #7fb0e0;
      --accent-soft: #26364a;
    }
  }
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font:
      15px/1.5 system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
  }
  :global(input, select, button) {
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 0.35rem 0.45rem;
  }
  :global(button) {
    cursor: pointer;
    background: var(--panel);
  }
  :global(button.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
    padding: 0.4rem 1.1rem;
  }
  :global(input:disabled, select:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  :global(a) {
    color: var(--accent);
  }
  :global(.rows) {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  :global(form label) {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  :global(.row) {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
  }
  :global(.grow) {
    flex: 1;
    min-width: 0;
  }
  :global(.lbl) {
    font-size: 0.75rem;
    color: var(--muted);
  }
  :global(.op) {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.06em;
    padding-left: 0.5rem;
  }
  :global(.rm) {
    padding: 0.3rem 0.6rem;
    line-height: 1;
    font-size: 1.1rem;
  }
  :global(.add) {
    align-self: flex-start;
  }
  :global(.note) {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
    max-width: 78ch;
  }
  :global(.floating-panel) {
    position: absolute;
    z-index: 20;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  }
  :global(.combo) {
    position: relative;
  }
  :global(.combo input) {
    width: 100%;
  }
  :global(.combo ul) {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    max-height: 15rem;
    overflow-y: auto;
  }
  :global(.combo li button) {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.35rem 0.55rem;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  :global(.combo li button.active) {
    background: var(--accent-soft);
  }
  :global(.combo .name) {
    font-weight: 600;
  }
  :global(.combo .meta) {
    font-size: 0.78rem;
    color: var(--muted);
    white-space: nowrap;
  }
  :global(.combo .none) {
    padding: 0.45rem 0.55rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  header {
    display: flex;
    gap: 1.5rem;
    align-items: baseline;
    padding: 0.7rem 1.2rem;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-weight: 700;
    text-decoration: none;
    color: var(--fg);
  }
  main {
    max-width: 62rem;
    margin: 0 auto;
    padding: 1.2rem;
  }
</style>
