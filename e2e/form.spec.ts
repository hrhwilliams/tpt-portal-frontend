import { expect, test } from '@playwright/test';

/**
 * Covers the interaction the static checks cannot see: clicking. Every one of
 * these goes through a `bind:` path, and that path has broken once already.
 * `npm run verify` covers the pure functions; this covers the widgets.
 */

/** There are several MultiSelects and the results box also uses `.panel`. */
const trigger = (id: string) => `[aria-controls="${id}-list"]`;
const panel = (id: string) => `#${id}-list`;

/** Clicks before hydration are swallowed — the SSR'd markup has no handlers yet. */
async function open(page: import('@playwright/test').Page, url = '/search') {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

test('add / remove rows, and the row count survives submit', async ({ page }) => {
	await open(page);

	await page.getByRole('button', { name: '+ Add attribute' }).click();
	await page.getByRole('button', { name: '+ Add attribute' }).click();
	await expect(page.getByLabel('Remove this row')).toHaveCount(2);

	await page.getByLabel('Remove this row').first().click();
	await expect(page.getByLabel('Remove this row')).toHaveCount(1);

	await page.getByRole('button', { name: '+ Add taxon' }).click();
	await expect(page.getByLabel('Remove this taxon')).toHaveCount(1);
});

test('a composed search reaches the URL and the query', async ({ page }) => {
	await open(page);

	await page.getByRole('button', { name: '+ Add taxon' }).click();
	await page.getByLabel('Rank').selectOption('genus');
	await page.getByLabel('Name').fill('Sorex');

	await page.getByRole('button', { name: '+ Add attribute' }).click();
	await page.getByLabel('Attribute').selectOption('detected');
	await page.getByLabel('Value').selectOption('ectoparasite');

	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page).toHaveURL(/taxon=genus%7CSorex/);
	await expect(page).toHaveURL(/attr=detected%7Cectoparasite/);
	await expect(page.locator('pre')).toContainText('detected.hierarchy');
	await expect(page.locator('pre')).toContainText('genus.split');
});

test('an attribute with no value searches for the type alone', async ({ page }) => {
	await open(page);

	await page.getByRole('button', { name: '+ Add attribute' }).click();
	await page.getByLabel('Attribute').selectOption('examined for');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page).toHaveURL(/attr=examined\+for(&|$)/);
	await expect(page.locator('pre')).toContainText('"exists"');
	await expect(page.locator('pre')).toContainText('examined_for');
});

test('NOT, AND/OR and method are hidden until Advanced is on', async ({ page }) => {
	await open(page, '/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite');

	const advanced = page.getByRole('checkbox', { name: 'Advanced' });
	await expect(advanced).not.toBeChecked();
	await expect(page.getByLabel('Method contains')).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'NOT' })).toHaveCount(0);
	await expect(page.getByRole('radio', { name: /^OR/ })).toHaveCount(0);

	await advanced.check();
	await expect(page.getByLabel('Method contains')).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'NOT' })).toHaveCount(2);
});

test('a link using advanced options opens expanded', async ({ page }) => {
	await open(page, '/search?attr=%21detected%7Cectoparasite');
	await expect(page.getByRole('checkbox', { name: 'Advanced' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'NOT' })).toBeChecked();
});

test('switching Advanced off discards its filters', async ({ page }) => {
	await open(page, '/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite&attr_op=or');
	await expect(page.locator('pre')).toContainText('minimum_should_match');

	await page.getByRole('checkbox', { name: 'Advanced' }).uncheck();
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page).not.toHaveURL(/attr_op=or/);
	await expect(page.locator('pre')).not.toContainText('minimum_should_match');
});

test('NOT disables the method input', async ({ page }) => {
	await open(page, '/search?attr=examined+for%7Cectoparasite&method=comb');

	const method = page.getByLabel('Method contains');
	await expect(method).toBeEnabled();

	await page.getByRole('checkbox', { name: 'NOT' }).check();
	await expect(method).toBeDisabled();
	await expect(page.getByText('Method is unavailable')).toBeVisible();
});

test('AND/OR toggle changes the emitted query', async ({ page }) => {
	await open(page, '/search?attr=detected%7Cectoparasite&attr=detected%7Cendoparasite');
	await expect(page.locator('pre')).not.toContainText('minimum_should_match');

	await page.getByRole('checkbox', { name: 'Advanced' }).check();
	await page.getByRole('radio', { name: /^OR/ }).check();
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page).toHaveURL(/attr_op=or/);
	await expect(page.locator('pre')).toContainText('minimum_should_match');
});

test('collection multi-select: checked float to the top, label truncates at two', async ({
	page
}) => {
	await open(page);

	await page.getByRole('button', { name: 'Any collection' }).click();
	// opening focuses the filter, so typing works without clicking into it
	await expect(page.getByPlaceholder(/Type to filter/)).toBeFocused();
	await page.keyboard.type('MSB');

	for (const name of ['MSB:Mamm', 'MSB:Para', 'MSB:Bird']) {
		await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
	}

	// checked group is rendered before the divider
	const items = page.locator(`${panel('collections')} li`);
	const firstThree = await items
		.locator('.txt')
		.evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent));
	expect(firstThree).toEqual(['MSB:Mamm', 'MSB:Para', 'MSB:Bird']);
	await expect(page.locator(`${panel('collections')} hr`)).toHaveCount(1);

	await page.keyboard.press('Escape');
	await expect(page.locator(`${trigger('collections')} .label`)).toHaveText(
		'MSB:Mamm, MSB:Para, …'
	);

	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.locator('pre')).toContainText('"terms"');
});

test('Clear empties the collection selection', async ({ page }) => {
	await open(page, '/search?prefix=MSB%3AMamm&prefix=MSB%3APara');

	await page.getByRole('button', { name: 'MSB:Mamm, MSB:Para' }).click();
	const clear = page.getByRole('button', { name: 'Clear all' });
	await clear.click();

	await expect(page.locator(`${trigger('collections')} .label`)).toHaveText('Any collection');
	await expect(clear).toHaveCount(0);
});

test('taxon autocomplete suggests and fills', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: '+ Add taxon' }).click();
	await page.getByLabel('Name').fill('Sor');

	// scoped to the combobox listbox — a <select>'s <option>s also carry role=option
	const option = page.getByRole('listbox').getByRole('option').first();
	await expect(option).toBeVisible();
	await option.click();
	await expect(page.getByLabel('Name')).not.toHaveValue('Sor');
});
