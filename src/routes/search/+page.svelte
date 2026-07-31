<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AttributeRows from '$lib/components/AttributeRows.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
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
	let q = $state<SearchQuery>(untrack(() => structuredClone(data.query)));

	// Opens itself when a shared link already uses one of these, so a pasted URL
	// never hides part of its own query.
	const usesAdvanced = (s: SearchQuery) =>
		hasNegatedRow(s) || s.attr_op === 'or' || s.method.trim() !== '';
	let advanced = $state(untrack(() => usesAdvanced(data.query)));

	$effect(() => {
		q = structuredClone(data.query);
		advanced = usesAdvanced(data.query);
	});

	/** Hidden inputs must not keep filtering. Switching off discards them. */
	function toggleAdvanced(on: boolean) {
		advanced = on;
		if (!on) {
			q.attributes = q.attributes.map((a) => ({ ...a, negated: false }));
			q.attr_op = 'and';
			q.method = '';
		}
	}

	const negated = $derived(hasNegatedRow(q));
	const opts = (vals: { value: string; count: number }[]) =>
		vals.map((v) => ({ value: v.value, label: v.value, hint: v.count.toLocaleString() }));
	const collectionOptions = $derived(opts(data.schema.guid_prefixes));
	const countryOptions = $derived(opts(data.schema.countries));
	const stateOptions = $derived(opts(data.schema.states));
	const searchUrl = $derived(resolve(`/search?${toParams(q).toString()}`));

	// The service decides which fields come back, so the table follows it.
	const columns = $derived(data.hits?.length ? Object.keys(data.hits[0]) : []);
	const cell = (v: unknown) =>
		v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

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
		<legend>1 · Record search</legend>
		<TaxonRows bind:rows={q.taxa} schema={data.schema} />
		<p class="note">
			Suggestions come from the current snapshot. A name that is not listed can still be searched
			for.
		</p>
	</fieldset>

	<fieldset>
		<legend>2 · Record attributes</legend>
		<AttributeRows bind:rows={q.attributes} bind:op={q.attr_op} {advanced} schema={data.schema} />

		<label class="adv">
			<input
				type="checkbox"
				checked={advanced}
				onchange={(e) => toggleAdvanced(e.currentTarget.checked)}
			/>
			<span>Advanced</span>
			<em>negate a row, switch AND/OR, filter by method</em>
		</label>

		{#if advanced}
			<label class="method">
				<span class="lbl">Method contains</span>
				<input type="text" bind:value={q.method} disabled={negated} placeholder="e.g. immunoblot" />
			</label>
			{#if negated}
				<p class="note warn">
					Method is unavailable while a row is negated. “No <em>detected</em> row
					<em>by this method</em>” would still match a specimen whose positive was found another
					way.
				</p>
			{:else}
				<p class="note">
					Method is recorded as prose, not from a controlled list, so matching is approximate —
					<code>comb</code> will not find <code>combed</code>. Much of the corpus predates method
					recording and carries none at all. The condition applies to every attribute row above.
				</p>
			{/if}
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
		<legend>3 · Global filters</legend>
		<div class="grid two">
			<div class="field">
				<span class="lbl">Held by collection</span>
				<MultiSelect
					id="collections"
					bind:selected={q.guid_prefixes}
					options={collectionOptions}
					placeholder="Any collection"
					filterPlaceholder="Type to filter {data.schema.guid_prefixes.length} collections…"
				/>
			</div>
			<label>
				<span class="lbl">Locality</span>
				<input type="text" bind:value={q.locality} placeholder="e.g. Isle Royale National Park" />
			</label>
			<div class="field">
				<span class="lbl">Country</span>
				<MultiSelect
					id="countries"
					bind:selected={q.countries}
					options={countryOptions}
					placeholder="Any country"
					filterPlaceholder="Type to filter {data.schema.countries.length} countries…"
				/>
			</div>
			<div class="field">
				<span class="lbl">State / province</span>
				<MultiSelect
					id="states"
					bind:selected={q.states}
					options={stateOptions}
					placeholder="Any state or province"
					filterPlaceholder="Type to filter {data.schema.states.length} states…"
				/>
			</div>
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
			Values within one dropdown <strong>OR</strong> together; separate filters
			<strong>AND</strong>. Locality matches whole place names, and applies together with the date
			to the
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

{#if data.hits}
	<div class="panel">
		<h2>
			{data.total.toLocaleString()}{data.totalIsLowerBound ? '+' : ''} result{data.total === 1
				? ''
				: 's'}
			{#if data.hits.length < data.total}
				<span class="muted">— showing {data.hits.length.toLocaleString()}</span>
			{/if}
		</h2>
		{#if data.hits.length}
			<!-- ponytail: columns are whatever the service returns. Spec 05's real
			     table — chosen columns, expandable events, "10,000+" — replaces this. -->
			<div class="scroll">
				<table>
					<thead>
						<tr
							>{#each columns as c (c)}<th>{c}</th>{/each}</tr
						>
					</thead>
					<tbody>
						{#each data.hits as hit, i (i)}
							<tr
								>{#each columns as c (c)}<td>{cell(hit[c])}</td>{/each}</tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
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
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.grid.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.7rem;
	}
	.adv {
		flex-direction: row;
		align-items: baseline;
		gap: 0.4rem;
		margin-top: 0.8rem;
		font-size: 0.85rem;
		width: fit-content;
		cursor: pointer;
	}
	.adv em {
		font-style: normal;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.method {
		margin-top: 0.7rem;
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
	.muted {
		font-weight: 400;
		color: var(--muted);
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	th,
	td {
		border: 1px solid var(--line);
		padding: 0.25rem 0.5rem;
		text-align: left;
		max-width: 40ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	th {
		background: var(--bg);
	}
</style>
