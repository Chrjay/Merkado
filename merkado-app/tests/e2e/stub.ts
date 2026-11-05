import { expect, type Page, type Route } from '@playwright/test';

export const PRODUCTS = [
  { product_id: 1, product: 'Coke Mismo', unit: 'bote', pack_multiplier: 1, price: 20, sort_order: 1, active: true },
  { product_id: 2, product: 'Lucky Me Pancit Canton', unit: 'pakete', pack_multiplier: 1, price: 16, sort_order: 2, active: true },
  { product_id: 3, product: 'Kopiko Brown', unit: 'sachet', pack_multiplier: 1, price: 9, sort_order: 3, active: true },
  { product_id: 4, product: 'Pandesal', unit: 'piraso', pack_multiplier: 1, price: 3, sort_order: 4, active: true },
  { product_id: 5, product: 'Yelo', unit: 'supot', pack_multiplier: 1, price: 5, sort_order: 5, active: true },
  { product_id: 6, product: 'Fortune (stick)', unit: 'stick', pack_multiplier: 1, price: 7, sort_order: 6, active: true },
];

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tindera@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

function b64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'e2e-refresh',
    user: USER,
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export interface StubState {
  /** When true, the submit_events RPC fails like a dead connection. */
  networkDown: boolean;
  rpcCalls: number;
}

/** Fakes the Supabase auth and PostgREST endpoints so the app runs with no backend. */
export async function stubSupabase(page: Page): Promise<StubState> {
  const state: StubState = { networkDown: false, rpcCalls: 0 };

  await page.route('**/auth/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token')) return json(route, session());
    if (url.pathname.endsWith('/user')) return json(route, USER);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/rpc/')) {
      if (state.networkDown) return route.abort('internetdisconnected');
      state.rpcCalls += 1;
      const body = route.request().postDataJSON() as { p_events?: { id: string }[] } | null;
      const ids = (body?.p_events ?? []).map((e) => e.id);
      if (url.pathname.endsWith('/void_sale')) return json(route, true);
      return json(route, { accepted: ids, duplicates: [], rejected: [], server_time: new Date().toISOString() });
    }
    if (url.pathname.endsWith('/products')) return json(route, PRODUCTS);
    return json(route, []);
  });

  return state;
}

/** A product tile in the Benta grid (cart rows reuse the product name). */
export function productTile(page: Page, name: string) {
  return page.getByRole('list', { name: 'Mga produkto' }).getByRole('button', { name: new RegExp(`^${name}`) });
}

export async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('tindera@example.com');
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Mag-login' }).click();
  await expect(page.getByRole('navigation', { name: 'Mga screen' })).toBeVisible();
}
