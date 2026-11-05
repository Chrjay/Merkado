import { expect, test } from '@playwright/test';
import { login, productTile, stubSupabase } from './stub';

test.use({ serviceWorkers: 'block' });

test('a sale made offline is saved and waits in the outbox', async ({ page, context }) => {
  const stub = await stubSupabase(page);
  await login(page);
  await expect(productTile(page, 'Coke Mismo')).toBeVisible();

  stub.networkDown = true;
  await context.setOffline(true);

  await productTile(page, 'Coke Mismo').click();
  await productTile(page, 'Pandesal').click();
  await expect(page.getByTestId('cart-total')).toHaveText('₱23.00');

  const save = page.getByRole('button', { name: 'I-save', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByRole('status').filter({ hasText: 'Naitala na!' })).toBeVisible();
  await expect(page.getByTestId('cart-total')).toHaveText('₱0.00');

  await page.getByRole('navigation', { name: 'Mga screen' }).getByRole('button', { name: /Ngayon/ }).click();
  await expect(page.getByTestId('unsent-count')).toContainText('1 hindi pa naipadala');
  await expect(page.getByText('Hindi pa naipadala', { exact: true })).toBeVisible();
  await expect(page.getByTestId('today-total')).toHaveText('₱23.00');
  expect(stub.rpcCalls).toBe(0);
});
