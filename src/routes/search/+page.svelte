<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AttributeRows from '$lib/components/AttributeRows.svelte';
	import TaxonRows from '$lib/components/TaxonRows.svelte';
	import { hasNegatedRow, toParams } from '$lib/query';
	import type { SearchQuery } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Local edit buffer. Edits live only between keystroke and submit; the URL
	// remains the state, and every navigation replaces this wholesale.
	//
	// This must be $state, not a writable $derived: $derived does not proxy its
	// value, so `q.attributes` would be a plain array and pushing a row through
	// `bind:` would not re-render. Deep reactivity is the whole requirement here.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let q = $state<SearchQuery>(untrack(() => structuredClone(data.query)));
	$effect(() => {
		q = structuredClone(data.query);
	});

	const negated = $derived(hasNegatedRow(q));
	const searchUrl = $derived(resolve(`/search?${toParams(q).toString()}`));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		q.page = 1; // changing a filter resets paging
		goto(resolve(`/search?${toParams(q).toString()}`), { keepFocus: true, noScroll: true });
	}

	function reset() {
		goto(resolve('/search'));
	}
</script>

<svelte:head><title>Search specimens — TPT portal</title></svelte:head>

<h1>Search specimens</h1>
<p class="snapshot">
	Data current as of {data.schema.snapshot_date}. This is a snapshot, not a live view of Arctos.
</p>

<form onsubmit={submit}>
	<fieldset>
		<legend>1 · Which organisms, and from where held</legend>
		<TaxonRows bind:rows={q.taxa} bind:guidPrefixes={q.guid_prefixes} schema={data.schema} />
		<p class="note">
			Suggestions come from the current snapshot. A name that is not listed can still be searched
			for.
		</p>
	</fieldset>

	<fieldset>
		<legend>2 · What was recorded about them</legend>
		<AttributeRows bind:rows={q.attributes} bind:op={q.attr_op} schema={data.schema} />

		<label class="method">
			<span class="lbl">Method contains</span>
			<input type="text" bind:value={q.method} disabled={negated} placeholder="e.g. immunoblot" />
		</label>
		{#if negated}
			<p class="note warn">
				Method is unavailable while a row is negated. “No <em>detected</em> row
				<em>by this method</em>” would still match a specimen whose positive was found another way.
			</p>
		{:else}
			<p class="note">
				Method is recorded as prose, not from a controlled list, so matching is approximate —
				<code>comb</code> will not find <code>combed</code>. Much of the corpus predates method
				recording and carries none at all. The condition applies to every attribute row above.
			</p>
		{/if}

		<p class="note honesty">
			Results reflect what was recorded. A specimen with no result row is <strong>not</strong> a
			negative — it may have been examined with the outcome unrecorded, or never examined.
			<em>Not detected</em> returns only explicitly recorded negatives.
			<a
				href="https://handbook.arctosdb.org/best_practices/examined.html"
				target="_blank"
				rel="noreferrer"
			>
				Arctos guidance on examined/detected data
			</a>
		</p>
	</fieldset>

	<fieldset>
		<legend>3 · Where and when</legend>
		<div class="grid two">
			<label>
				<span class="lbl">Locality</span>
				<input type="text" bind:value={q.locality} placeholder="e.g. Isle Royale National Park" />
			</label>
			<label>
				<span class="lbl">Country</span>
				<select bind:value={q.country}>
					<option value="">— any —</option>
					{#each data.schema.countries as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			</label>
			<label>
				<span class="lbl">State / province</span>
				<input type="text" bind:value={q.state_prov} />
			</label>
			<label>
				<span class="lbl">Collector (Arctos agent URL)</span>
				<input
					type="text"
					bind:value={q.collector_id}
					placeholder="https://arctos…/agent/1010760"
				/>
			</label>
			<label>
				<span class="lbl">Collected from</span>
				<input type="date" bind:value={q.collected_from} />
			</label>
			<label>
				<span class="lbl">Collected to</span>
				<input type="date" bind:value={q.collected_to} />
			</label>
		</div>
		<p class="note">
			Locality matches whole place names, and applies together with the date to the
			<strong>same collecting event</strong>. Country, state and collector are record-level, so they
			are not tied to that event — a specimen collected in two countries can match a country-A
			search with a date from its country-B visit. Some collection dates record only a year or a
			month; a year-only date is read as 1 January, so a mid-year range will not match it.
		</p>
	</fieldset>

	<div class="actions">
		<button type="submit" class="primary">Search</button>
		<button type="button" onclick={reset}>Clear</button>
		<code class="url">{searchUrl}</code>
	</div>
</form>

{#if data.errors.length}
	<div class="panel errors">
		<h2>This search cannot run</h2>
		<ul>
			{#each data.errors as e (e)}<li>{e}</li>{/each}
		</ul>
	</div>
{/if}

{#if data.translation}
	<div class="panel">
		<h2>Query sent to Elasticsearch</h2>
		<p class="note">
			No backend exists yet, so the search stops here. This is the body the Rust service would send.
		</p>
		{#if data.translation.notes.length}
			<ul class="notes">
				{#each data.translation.notes as n (n)}<li>{n}</li>{/each}
			</ul>
		{/if}
		<pre>{JSON.stringify(data.translation.body, null, 2)}</pre>
	</div>
{:else if data.submitted && !data.errors.length}
	<div class="panel">
		<p>No filters set.</p>
	</div>
{/if}

<style>
	h1 {
		margin-bottom: 0.2rem;
	}
	.snapshot {
		margin-top: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.9rem 1rem 1rem;
		margin: 0 0 1rem;
	}
	legend {
		font-weight: 700;
		padding: 0 0.4rem;
	}
	.grid.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.7rem;
	}
	.method {
		margin-top: 0.9rem;
		max-width: 24rem;
	}
	.note.warn {
		color: #b4544a;
	}
	.honesty {
		border-left: 3px solid var(--accent);
		padding-left: 0.7rem;
		margin-top: 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 1.4rem;
	}
	.url {
		font-size: 0.72rem;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.panel {
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.8rem 1rem;
		background: var(--panel);
		margin-bottom: 1.2rem;
	}
	.panel h2 {
		font-size: 1rem;
		margin: 0 0 0.3rem;
	}
	.errors {
		border-color: #b4544a;
	}
	.notes {
		font-size: 0.8rem;
		color: var(--muted);
		max-width: 88ch;
	}
	.notes li {
		margin-bottom: 0.25rem;
	}
	pre {
		overflow-x: auto;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.7rem;
		font-size: 0.78rem;
		line-height: 1.4;
	}
</style>
