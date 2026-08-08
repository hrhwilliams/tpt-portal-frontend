<script lang="ts">
  import Combobox, { type Match } from "./Combobox.svelte";
  import { getTaxa } from "$lib/api";

  let { value = $bindable(), rank, id }: { value: string; rank: string; id?: string } = $props();

  async function search(q: string, signal: AbortSignal): Promise<Match[]> {
    const taxa = await getTaxa(fetch, q, { rank, signal });
    return taxa.map((t) => ({ key: `${t.rank}|${t.name}`, label: t.name, count: t.record_count }));
  }
</script>

<Combobox
  {id}
  bind:value
  {search}
  placeholder="e.g. Sorex"
  noMatchText="No match."
/>
