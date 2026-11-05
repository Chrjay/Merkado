# MerkaDo Supabase setup

## Setup order (Supabase SQL Editor)

1. Run `schema.sql`.
2. Run `seed_products.sql` — edit it first to match the store's real items, packs, and prices.
3. Auth: turn sign-ups off, create the store user, then:
   ```sql
   insert into public.store_users (user_id, role) values ('<user uuid>', 'owner');
   ```
4. Set the merkado_reader password — in the SQL Editor run:
   ```sql
   alter role merkado_reader with password '<strong password>';
   ```
   Never commit the password; keep it in the group password manager / Colab Secrets.
   The notebook connects via the pooler connection string as user `merkado_reader`
   and reads only the `reporting` views.

## Testing

```
cd merkado-app && npm run db:test
```

Runs `test/stub.sql` (Supabase auth/roles stub) → `schema.sql` → `seed_products.sql` → `tests.sql`
in an in-memory PGlite database; exits non-zero on any failure.
`tests.sql` commits test data — never run it on the main project (a throwaway test project only).

## Files

- `schema.sql` — full database schema (run once on a fresh project).
- `seed_products.sql` — starter product list; edit per store.
- `tests.sql` — schema tests; emits `PASS:` notices counted by the runner.
- `test/stub.sql` — recreates Supabase's built-in auth schema/roles for PGlite.
- `test/run.mjs` — Node test runner (PGlite).
- `migrations/` — numbered migrations for changes after the baseline.
