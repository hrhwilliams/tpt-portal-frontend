import { expect, test } from "@playwright/test";

/**
 * Covers the interaction the static checks cannot see: clicking. Every one of
 * these goes through a `bind:` path, and that path has broken once already.
 * The URL is the whole request, so these assert on the URL, not on hits.
 *
 * **The Rust service must be running.** Playwright starts the dev server but not
 * the backend, and the form is built from `GET /api/schema` — without it every
 * test fails on a 503, not just the ones that search.
 */

/** There are several MultiSelects and the results box also uses `.panel`. */
const trigger = (id: string) => `[aria-controls="${id}-list"]`;
const panel = (id: string) => `#${id}-list`;

/** "Advanced", "+ Add attribute" etc. are duplicated across the two attribute
 *  fieldsets — scope to the one the test cares about. */
const detectionAttrs = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: "Examined for/detected attributes" });
const otherAttrs = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: "Other record attributes" });

/** Clicks before hydration are swallowed — the SSR'd markup has no handlers yet. */
async function open(page: import("@playwright/test").Page, url = "/search") {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test("add / remove rows, and the row count survives submit", async ({ page }) => {
  await open(page);

  const attrs = otherAttrs(page);
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await expect(attrs.getByLabel("Remove this row")).toHaveCount(2);

  await attrs.getByLabel("Remove this row").first().click();
  await expect(attrs.getByLabel("Remove this row")).toHaveCount(1);

  await page.getByRole("button", { name: "+ Add taxon" }).click();
  await expect(page.getByLabel("Remove this taxon")).toHaveCount(1);
});

test("live search: an edit reaches the URL with no Search click, and typing survives it", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "+ Add taxon" }).click();
  await page.getByLabel("Rank").selectOption("genus");
  await page.getByLabel("Name").fill("Sorex");
  await expect(page).toHaveURL(/taxon=genus%7CSorex/);

  // the navigation the first edit triggered must not overwrite a later one
  await page.getByLabel("Name").fill("Sorex cinereus");
  await expect(page).toHaveURL(/taxon=genus%7CSorex\+cinereus/);
  await expect(page.getByLabel("Name")).toHaveValue("Sorex cinereus");
});

test("a taxon row carries its own relationships", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "+ Add taxon" }).click();
  await page.getByLabel("Rank").selectOption("genus");
  await page.getByLabel("Name").fill("Sorex");

  await page.getByRole("button", { name: "Any relationship" }).click();
  await page.getByRole("checkbox", { name: "parasite of", exact: true }).check();
  await page.getByRole("checkbox", { name: "host of parasite" }).check();
  await page.keyboard.press("Escape");

  // third field on the row's own param, so rows cannot misalign
  await expect(page).toHaveURL(/taxon=genus%7CSorex%7Cparasite\+of%3B\+host\+of\+parasite/);

  // and a pasted link puts them back in the row
  await open(page, "/search?taxon=genus%7CSorex%7Cate");
  await expect(page.locator('[aria-controls="taxon-relations-0-list"] .label')).toHaveText("ate");
});

test("a taxon row carries several related taxa", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite");

  // the related taxa are hidden until the row has a relationship to hang them on
  for (const [i, [rank, name]] of [
    ["family", "Ixodidae"],
    ["genus", "Aus"],
  ].entries()) {
    await page.getByRole("button", { name: "+ Add related taxon" }).click();
    await page.locator(`#related-rank-0-${i}`).selectOption(rank);
    await page.locator(`#related-name-0-${i}`).fill(name);
  }

  // rank and name per related taxon, appended after the relations segment
  await expect(page).toHaveURL(/taxon=genus%7CSorex%7Chost\+of\+parasite%7Cfamily%7CIxodidae%7Cgenus%7CAus/);

  // and a pasted link puts them back, expanded
  await open(page, "/search?taxon=genus%7CSorex%7Cate%7Cfamily%7CIxodidae");
  await expect(page.locator("#related-rank-0-0")).toHaveValue("family");
  await expect(page.locator("#related-name-0-0")).toHaveValue("Ixodidae");
});

test("a relationship search gets a second tab, holding the records related to it", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite%7Cclass%7CCestoda");

  const related = page.getByRole("tab", { name: /host of parasite/ });
  await expect(related).toHaveAttribute("aria-selected", "false");

  // tab 1 holds the hosts
  const host = page.locator("tbody tr").first();
  await expect(host).toContainText("Sorex");
  const hostGuid = await host.getByRole("link").first().textContent();

  await related.click();
  await expect(related).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=host\+of\+parasite/);

  // tab 2 holds their cestodes, as records of their own
  const parasite = page.locator("tbody tr").first();
  await expect(parasite).toContainText("Cestoda");
  await expect(parasite.getByRole("link").first()).not.toHaveText(hostGuid ?? "");
  await expect(parasite.getByRole("link").first()).toHaveAttribute("href", /arctos\.database\.museum/);
});

test("the export follows the open tab", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite%7Cclass%7CCestoda&page=2");

  const csv = page.getByRole("link", { name: "Export as CSV" });
  await expect(csv).toHaveAttribute("href", /api\/download/);
  await expect(csv).not.toHaveAttribute("href", /tab=/);

  await page.getByRole("tab", { name: /host of parasite/ }).click();
  await expect(csv).toHaveAttribute("href", /tab=host\+of\+parasite/);

  // an export covers the whole tab, not the page being looked at
  await expect(csv).not.toHaveAttribute("href", /page=/);
});

test("each tab reports and pages its own count", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite%7Cclass%7CCestoda");

  const records = page.getByRole("tab", { name: /^Records/ }).locator(".tally");
  const related = page.getByRole("tab", { name: /host of parasite/ }).locator(".tally");
  const hosts = Number((await records.textContent())?.replace(/[^\d]/g, ""));
  const parasites = Number((await related.textContent())?.replace(/[^\d]/g, ""));

  // no arithmetic ties the two: parasites are shared between hosts, and hosts carry several
  expect(hosts).toBeGreaterThan(0);
  expect(parasites).toBeGreaterThan(0);

  // the heading follows the open tab
  await expect(page.getByRole("heading", { level: 2 })).toContainText(hosts.toLocaleString());
  await page.getByRole("tab", { name: /host of parasite/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText(parasites.toLocaleString());

  // and paging the related tab does not repeat the first page
  const firstOnPageOne = await page.locator("tbody tr").first().textContent();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/tab=host\+of\+parasite/);
  await expect(page.locator("tbody tr").first()).not.toHaveText(firstOnPageOne ?? "");
});

test("a filter narrows both tabs", async ({ page }) => {
  const taxon = "taxon=genus%7CSorex%7Chost+of+parasite%7Cclass%7CCestoda";
  const tally = page.getByRole("tab", { name: /host of parasite/ }).locator(".tally");

  await open(page, `/search?${taxon}`);
  const unfiltered = Number((await tally.textContent())?.replace(/[^\d]/g, ""));

  // the related records come from the matched records, so narrowing those narrows these
  await open(page, `/search?${taxon}&from=2000-01-01&to=2010-01-01`);
  const filtered = Number((await tally.textContent())?.replace(/[^\d]/g, ""));

  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(unfiltered);
});

test("switching tabs starts the new one at page 1", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite&page=3");

  await page.getByRole("tab", { name: /host of parasite/ }).click();
  await expect(page).not.toHaveURL(/page=/);
});

test("a search with no relationship gets no relation tab", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex");
  // Records and Map are always there; the relation tab is not
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /of parasite/ })).toHaveCount(0);
});

test("the Map tab links to BerkeleyMapper with the export as its tab file", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex%7Chost+of+parasite");
  await page.getByRole("tab", { name: "Map" }).click();

  const href = await page.getByRole("link", { name: /BerkeleyMapper/ }).getAttribute("href");
  const params = new URL(href ?? "").searchParams;
  const tabfile = params.get("tabfile") ?? "";

  expect(href).toContain("berkeleymapper.berkeley.edu");
  // both files are served by the API, wherever it lives
  expect(params.get("configfile")).toMatch(/^https?:\/\/.+\/api\/berkeleymapper\.xml$/);
  expect(new URL(tabfile).origin).toBe(new URL(params.get("configfile") ?? "").origin);
  // the whole export of the records tab, not one page and not the relation tab
  expect(tabfile).toContain("/api/download?");
  expect(tabfile).not.toContain("tab=");
  expect(tabfile).not.toContain("page=");
});

test("paging: Next advances the page, and editing a filter returns to page 1", async ({ page }) => {
  await open(page, "/search?taxon=genus%7CSorex");

  const firstRow = page.locator("tbody tr").first();
  const rowOnPageOne = await firstRow.textContent();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(firstRow).not.toHaveText(rowOnPageOne ?? "");

  // a different result set makes the old page number meaningless
  await page.getByLabel("Name").fill("Peromyscus");
  await expect(page).toHaveURL(/taxon=genus%7CPeromyscus/);
  await expect(page).not.toHaveURL(/page=/);
});

test("a composed search reaches the URL and the query", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "+ Add taxon" }).click();
  await page.getByLabel("Rank").selectOption("genus");
  await page.getByLabel("Name").fill("Sorex");

  const attrs = detectionAttrs(page);
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await attrs.getByLabel("Attribute").selectOption("detected");

  // controlled vocabulary -> MultiSelect, so several values can be picked
  await attrs.getByRole("button", { name: "Any value" }).click();
  await attrs.getByRole("checkbox", { name: "ectoparasite", exact: true }).check();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/taxon=genus%7CSorex/);
  await expect(page).toHaveURL(/attr=detected%7Cectoparasite/);
});

test("several values on one attribute row OR together", async ({ page }) => {
  await open(page);

  const attrs = detectionAttrs(page);
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await attrs.getByLabel("Attribute").selectOption("detected");
  await attrs.getByRole("button", { name: "Any value" }).click();
  await attrs.getByRole("checkbox", { name: "ectoparasite: flea" }).check();
  await attrs.getByRole("checkbox", { name: "ectoparasite: louse" }).check();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/ectoparasite%3A\+flea%7Cectoparasite%3A\+louse/);
});

test("a free-text attribute type keeps a single text input", async ({ page }) => {
  await open(page);

  const attrs = otherAttrs(page);
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await attrs.getByLabel("Attribute").selectOption("age");

  await expect(attrs.getByRole("button", { name: "Any value" })).toHaveCount(0);
  await attrs.getByLabel(/^Value/).fill("adult");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/attr=age%7Cadult/);
});

test("an attribute with no value searches for the type alone", async ({ page }) => {
  await open(page);

  const attrs = detectionAttrs(page);
  await attrs.getByRole("button", { name: "+ Add attribute" }).click();
  await attrs.getByLabel("Attribute").selectOption("examined for");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/attr=examined\+for(&|$)/);
});

test("NOT, AND/OR and method are hidden until Advanced is on", async ({ page }) => {
  await open(page, "/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite");

  const advanced = detectionAttrs(page).getByRole("checkbox", { name: "Advanced" });
  await expect(advanced).not.toBeChecked();
  await expect(page.getByLabel("Method contains")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "NOT" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^OR/ })).toHaveCount(0);

  await advanced.check();
  await expect(page.getByLabel("Method contains")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "NOT" })).toHaveCount(2);
});

test("a link using advanced options opens expanded", async ({ page }) => {
  await open(page, "/search?attr=%21detected%7Cectoparasite");
  await expect(detectionAttrs(page).getByRole("checkbox", { name: "Advanced" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NOT" })).toBeChecked();
});

test("switching Advanced off discards its filters", async ({ page }) => {
  await open(page, "/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite&attr_op=or");

  await detectionAttrs(page).getByRole("checkbox", { name: "Advanced" }).uncheck();
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).not.toHaveURL(/attr_op=or/);
});

test("NOT disables the method input", async ({ page }) => {
  await open(page, "/search?attr=examined+for%7Cectoparasite&method=comb");

  const method = page.getByLabel("Method contains");
  await expect(method).toBeEnabled();

  await page.getByRole("checkbox", { name: "NOT" }).check();
  await expect(method).toBeDisabled();
  await expect(page.getByText("Method is unavailable")).toBeVisible();
});

test("AND/OR toggle reaches the URL", async ({ page }) => {
  await open(page, "/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite");

  await detectionAttrs(page).getByRole("checkbox", { name: "Advanced" }).check();
  await detectionAttrs(page).locator('input[type="radio"][value="or"]').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/attr_op=or/);
});

test("collection multi-select: checked float to the top, label truncates at two", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "Any collection" }).click();
  // opening focuses the filter, so typing works without clicking into it
  await expect(page.getByPlaceholder(/Type to filter/)).toBeFocused();
  await page.keyboard.type("MSB");

  for (const name of ["MSB:Mamm", "MSB:Para", "MSB:Bird"]) {
    await page.getByRole("checkbox", { name: new RegExp(`^${name}`) }).check();
  }

  // checked group is rendered before the divider
  const items = page.locator(`${panel("collections")} li`);
  const firstThree = await items.locator(".txt").evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent));
  expect(firstThree).toEqual(["MSB:Mamm", "MSB:Para", "MSB:Bird"]);
  await expect(page.locator(`${panel("collections")} hr`)).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator(`${trigger("collections")} .label`)).toHaveText("MSB:Mamm, MSB:Para, …");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/prefix=MSB%3AMamm&prefix=MSB%3APara&prefix=MSB%3ABird/);
});

test("Clear empties the collection selection", async ({ page }) => {
  await open(page, "/search?prefix=MSB%3AMamm&prefix=MSB%3APara");

  await page.getByRole("button", { name: "MSB:Mamm, MSB:Para" }).click();
  const clear = page.getByRole("button", { name: "Clear all" });
  await clear.click();

  await expect(page.locator(`${trigger("collections")} .label`)).toHaveText("Any collection");
  await expect(clear).toHaveCount(0);
});

test("taxon autocomplete suggests and fills", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "+ Add taxon" }).click();
  await page.getByLabel("Name").fill("Sor");

  // scoped to the combobox listbox — a <select>'s <option>s also carry role=option
  const option = page.getByRole("listbox").getByRole("option").first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByLabel("Name")).not.toHaveValue("Sor");
});
