<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
</script>

<svelte:head><title>Error — TPT portal</title></svelte:head>

<div class="panel errors">
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? "Something went wrong."}</p>
  <a href={resolve("/search")}>Back to search</a>
</div>

<style>
  .panel {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.8rem 1rem;
    background: var(--panel);
  }
  .errors {
    border-color: #b4544a;
  }
  h1 {
    margin: 0 0 0.3rem;
    font-size: 1.4rem;
  }
</style>
