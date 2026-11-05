import { expect, test } from '@playwright/test';
import { login, stubSupabase } from './stub';

test.use({ serviceWorkers: 'block' });

test('login screen renders when there is no session', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MerkaDo Tindahan' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mag-login' })).toBeEnabled();
  await expect(page.getByRole('navigation', { name: 'Mga screen' })).toHaveCount(0);
});

test('wrong password shows a Taglish error', async ({ page }) => {
  await stubSupabase(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Email').fill('tindera@example.com');
  await page.getByLabel('Password').fill('mali');
  await page.getByRole('button', { name: 'Mag-login' }).click();
  await expect(page.getByRole('alert')).toHaveText('Mali ang email o password.');
});

test('tab bar shows every screen after login', async ({ page }) => {
  await stubSupabase(page);
  await login(page);

  const nav = page.getByRole('navigation', { name: 'Mga screen' });
  for (const label of ['Benta', 'Araw', 'Stock', 'Ngayon', 'Settings']) {
    const tab = nav.getByRole('button', { name: label });
    await expect(tab).toBeVisible();
    await expect(tab.locator('svg')).toBeVisible();
  }

  await expect(page.getByRole('heading', { name: 'Benta', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Coke Mismo/ })).toBeVisible();

  for (const label of ['Araw', 'Stock', 'Ngayon', 'Settings']) {
    await nav.getByRole('button', { name: label }).click();
    await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible();
  }
});

test('no horizontal scroll from 360 to 640 px', async ({ page }) => {
  await stubSupabase(page);
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Mga screen' });
  for (const width of [360, 412, 640]) {
    await page.setViewportSize({ width, height: 800 });
    for (const label of ['Benta', 'Araw', 'Stock', 'Ngayon', 'Settings']) {
      await nav.getByRole('button', { name: label }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${label} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
