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
  await expect(page).toHaveURL(/ectoparasite%3A\+flea%3B\+ectoparasite%3A\+louse/);
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
