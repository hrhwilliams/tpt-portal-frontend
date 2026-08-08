<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<svelte:head><title>TPT specimen portal</title></svelte:head>

<h1>TPT specimen portal</h1>

<p>
  Search natural history specimen records by taxon, place, collection date, collector, and any recorded attribute for
  parasite or pathogen detection.
</p>

<p>Worth trying:</p>
<ul>
  <li>
    <a
      href={resolve(
        "/search?taxon=species%7CMyodes+gapperi&taxon=species%7CMyodes+rutilus&attr=examined+for%7Cectoparasite&attr=detected%7Cectoparasite&state=Alaska&from=1990-01-01&to=2026-12-31",
      )}
    >
      Either <em>Myodes</em> species, examined for and positive for ectoparasites, Alaska 1990–2026
    </a>
    — all three blocks at once: an OR of taxa, an AND of attributes, and a scope.
  </li>
  <li>
    <a
      href={resolve(
        "/search?taxon=genus%7CSorex&from=1994-01-01&to=1994-12-31&attr=detected%7Cvirus%3A+Orthohantavirus&method=immunoblot",
      )}
    >
      Genus <em>Sorex</em>, 1994, hantavirus detected by immunoblot
    </a>
    — one attribute row with a method, so it compiles to a correlated nested clause.
  </li>
  <li>
    <a href={resolve("/search?attr=examined+for%7Cectoparasite&attr=%21detected%7Cectoparasite")}>
      Examined for ectoparasites, with nothing detected
    </a>
    — two rows, the second negated. Note that the method input is disabled.
  </li>
  <li>
    <a href={resolve("/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite&attr_op=or")}>
      Ectoparasites <em>or</em> endoparasites detected
    </a>
    — the same rows switched to OR, collapsing to a single <code>should</code> clause.
  </li>
  <li>
    <a href={resolve("/search?attr=sex%7Cfemale&attr=life+stage%7Cjuvenile")}>Female juveniles</a>
    — the same mechanism over non-detection attributes, each with its own controlled vocabulary.
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
