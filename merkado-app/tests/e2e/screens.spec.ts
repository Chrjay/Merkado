import { test } from '@playwright/test';
import { login, productTile, stubSupabase } from './stub';

test.use({ serviceWorkers: 'block' });

const DIR = 'test-results/screens';
const WIDTHS = [360, 640];

test('screenshots of every screen at phone widths', async ({ page }) => {
  const stub = await stubSupabase(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.screenshot({ path: `${DIR}/login-${width}.png`, fullPage: true });
  }

  await login(page);
  stub.networkDown = true;
  const nav = page.getByRole('navigation', { name: 'Mga screen' });

  await productTile(page, 'Coke Mismo').click();
  await productTile(page, 'Coke Mismo').click();
  await productTile(page, 'Kopiko').click();
  await page.getByRole('button', { name: 'GCash', exact: true }).click();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await nav.getByRole('button', { name: 'Benta' }).click();
    await page.screenshot({ path: `${DIR}/benta-${width}.png` });
    await page.screenshot({ path: `${DIR}/benta-full-${width}.png`, fullPage: true });
  }

  await page.getByRole('button', { name: 'I-save', exact: true }).click();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const label of ['Araw', 'Stock', 'Ngayon', 'Settings']) {
      await nav.getByRole('button', { name: label }).click();
      await page.screenshot({ path: `${DIR}/${label.toLowerCase()}-${width}.png`, fullPage: true });
    }
  }

  await nav.getByRole('button', { name: 'Benta' }).click();
  const tile = productTile(page, 'Pandesal');
  const box = (await tile.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `${DIR}/benta-qty-dialog-640.png` });
});
