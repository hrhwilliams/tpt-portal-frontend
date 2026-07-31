<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<a class="brand" href={resolve('/')}>TPT specimen portal</a>
	<nav><a href={resolve('/search')}>Search</a></nav>
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
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font:
			15px/1.5 system-ui,
			-apple-system,
			'Segoe UI',
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
