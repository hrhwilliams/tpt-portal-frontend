<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<svelte:head><title>TPT specimen portal</title></svelte:head>

<h1>TPT specimen portal</h1>

<p>
  Search Arctos records by taxon, place, collection date, collector, and any recorded attribute for
  parasite or pathogen detection.
</p>

<p>Sample queries:</p>
<ul>
  <li>
    <a
      href={resolve(
        "/search?taxon=species%7CMyodes+gapperi&taxon=species%7CMyodes+rutilus&attr=examined+for%7Cectoparasite&attr=detected%7Cectoparasite&state=Alaska&from=1990-01-01&to=2026-12-31",
      )}
    >
      <em>Myodes gapperi</em> and <em>Myodes rutilus</em> examined for and positive for ectoparasites collected in Alaska between the years 1990 and 2026
    </a>
  </li>
  <li>
    <a
      href={resolve(
        "/search?taxon=genus%7CSorex&from=1994-01-01&to=1994-12-31&attr=detected%7Cvirus%3A+Orthohantavirus&method=immunoblot",
      )}
    >
      Genus <em>Sorex</em> positive for Orthohantavirus, detected by immunoblot
    </a>
  </li>
</ul>

<p><a class="cta" href={resolve("/search")}>Open the search form</a></p>

<style>
  li {
    margin-bottom: 0.5rem;
    max-width: 78ch;
  }
  .cta {
    display: inline-block;
    margin-top: 0.5rem;
    font-weight: 600;
  }
</style>
