<script lang="ts">
  import Combobox, { type Match } from "./Combobox.svelte";
  import type { CountedValue } from "$lib/types";

  let { value = $bindable(), options, id }: { value: string; options: CountedValue[]; id?: string } = $props();

  function search(q: string): Match[] {
    return options
      .filter((o) => o.value.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((o) => ({ key: o.value, label: o.value, count: o.count }));
  }
</script>

<Combobox {id} bind:value {search} placeholder="Any collector name" noMatchText="No match." />
