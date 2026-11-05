# MerkaDo

A point-of-sale and data-collection system for a Filipino sari-sari store,
plus the data-science pipeline that analyses the collected data. Built to
replace a Google Form/CSV workflow with an offline-capable phone app backed
by a real database.

## Architecture

```
Store owner's phone                Supabase (Postgres)              Your machine / Colab
┌──────────────────┐              ┌────────────────────┐            ┌─────────────────────┐
│ merkado-app (PWA)│  submit_     │ sales, sale_items, │  SELECT    │ MerkaDo_EDA         │
│ React+TS+Vite    │── events ───▶│ products,          │─ (views) ─▶│ merkado_eda.ipynb   │
│ Dexie outbox ────┼── batch ────▶│ day_events,        │            │ EDA, Apriori,       │
│ works offline    │              │ stock_counts, RLS  │            │ forecasting,        │
└──────────────────┘              │ reporting.* views  │            │ restock suggestions │
        ▲                         └────────────────────┘            └─────────┬───────────┘
        │                                  ▲                                  │
   Hosted on Vercel                   merkado_reader role              outputs/, weekly
                                      (read-only)                    reports/weekNN/
```

**Write path (app):** every action becomes a validated event, stored in an
IndexedDB outbox first, then synced to Postgres through `submit_events()`
(Security Definer RPC — batches of ≤50, atomic per sale, idempotent on
`trans_id`). Direct table writes are disabled; RLS denies everything else.
`void_sale()` flags a sale void without deleting rows.

**Read path (notebook):** `merkado_db.py` connects via the connection pooler
as `merkado_reader` (a role that can only `SELECT` the `reporting` views),
backs every view up to `outputs/backup/<date>/`, and reshapes the rows into
the log format the notebook expects. If the database is unreachable or
`MERKADO_DB_URL` is unset, it falls back to the CSV automatically.

## Repository layout

```
MerkaDo/
├── merkado-app/            # Store-facing POS PWA
│   ├── src/
│   │   ├── screens/        # Login, Benta, Araw, Stock, Ngayon, Settings (Taglish)
│   │   ├── lib/            # events (zod), db (Dexie), sync engine, supabase client
│   │   ├── hooks/          # useAuth, useProducts, useOutbox, useSync, useTodaySales, useClockCheck
│   │   └── components/     # shared UI (Lucide icons, CSS Modules)
│   ├── supabase/
│   │   ├── schema.sql      # tables, RLS, RPCs, reporting views, merkado_reader
│   │   ├── seed_products.sql
│   │   ├── tests.sql + test/   # PGlite test harness (npm run db:test)
│   │   └── migrations/
│   ├── CONTRACT.md         # app ↔ DB ↔ notebook interface contract
│   └── vercel.json         # SPA rewrites, PWA cache headers
├── MerkaDo_EDA/            # Analysis pipeline
│   ├── merkado_eda.ipynb   # sections 0-12: cleaning → ABC → Apriori → forecast → restock
│   ├── merkado_db.py       # Supabase reader + CSV fallback + weekly backup
│   ├── data/               # proxy + mock CSVs (not real store data)
│   ├── outputs/            # generated CSVs/figures/backup/<date>/
│   ├── reports/            # weekly snapshots
│   └── tests/              # pytest for merkado_db
└── Architecture/           # design docs (v1 app arch, v2 supabase arch)
```

## Tech stack

| Layer | Choices |
|---|---|
| Frontend | React 19, TypeScript 5.9 (strict), Vite 8, `vite-plugin-pwa` + Workbox, CSS Modules, Lucide icons |
| Offline | Dexie 4 (IndexedDB outbox + catalog cache), zod 4 event validation |
| Backend | Supabase Postgres, Supabase Auth (single store login, sign-ups disabled), RLS deny-by-default, `submit_events`/`void_sale` SECURITY DEFINER RPCs, `reporting` schema views |
| Analysis | Python 3.10+, pandas, numpy, statsmodels, scikit-learn, mlxtend, SQLAlchemy + psycopg2 |
| Testing | Vitest + RTL + fake-indexeddb, Playwright, PGlite db tests, pytest |
| Hosting | Vercel (static + PWA) |

---

## Setup

### 1. Supabase (one-time, owner of the project)

1. Create a project at [supabase.com](https://supabase.com) — region **Singapore**, save the DB password in a password manager.
2. **SQL Editor** → run `merkado-app/supabase/schema.sql`, then `seed_products.sql`
   (edit the seed file first to the store's real products/prices).
3. **Authentication → Sign In/Providers** → disable "Allow new users to sign up".
4. **Authentication → Users → Add user** → create the store login (auto-confirm).
   Copy its UUID, then in SQL Editor:
   ```sql
   insert into public.store_users (user_id, role) values ('<uuid>', 'owner');
   ```
5. Set the notebook reader password:
   ```sql
   alter role merkado_reader with password '<strong-password>';
   ```
   Store it in the group password manager — never in Git.
6. **Settings → API Keys**: copy the **Project URL** (or read it off
   `supabase.com/dashboard/project/<ref>` → `https://<ref>.supabase.co`) and the
   **publishable** key (`sb_publishable_…` or legacy `anon`). Never use the
   `secret`/`service_role` key in the app.
7. **Connect** button (top of dashboard) → Session pooler string → rewrite for
   the notebook: `postgres.<ref>` → `merkado_reader.<ref>` and
   `[YOUR-PASSWORD]` → the reader password:
   ```
   postgresql://merkado_reader.<ref>:<reader-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Percent-encode `@ # ? &` or spaces in the password — easiest is letters +
   digits only.

### 2. App — local development

Requires Node.js 20+.

```bash
cd merkado-app
npm install
```

Create `merkado-app/.env.local` (already gitignored via `*.local`):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```bash
npm run dev        # serves on the LAN too (--host): open on the phone to test
```

### 3. App — deploy to Vercel

```bash
cd merkado-app
vercel login
vercel link        # create project, root directory ./
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
vercel deploy --prod
```

Or push to GitHub and import the repo in the Vercel dashboard — `vercel.json`
is already configured. On the owner's phone: open the URL → log in →
**Add to Home screen**.

`.env.local` never deploys — Vercel builds use the env vars configured in the
project.

### 4. Notebook environment

#### Windows (PowerShell)

```powershell
cd MerkaDo_EDA
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# if pinned versions fail on Python 3.13/3.14, use:
# pip install numpy pandas matplotlib seaborn scipy statsmodels scikit-learn mlxtend jupyter sqlalchemy psycopg2-binary
```

Set `MERKADO_DB_URL` — persistent (registry, survives reboots):

```powershell
[Environment]::SetEnvironmentVariable('MERKADO_DB_URL', 'postgresql://merkado_reader.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres', 'User')
# then open a NEW window — env vars load at process start
```

or per-session only (in the same window you launch Jupyter from):

```powershell
$env:MERKADO_DB_URL="postgresql://merkado_reader.<ref>:<password>@..."
```

#### macOS / Linux (bash, zsh)

```bash
cd MerkaDo_EDA
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

```bash
export MERKADO_DB_URL="postgresql://merkado_reader.<ref>:<password>@..."
# persist it: append the same line to ~/.zshrc or ~/.bashrc
```

#### Google Colab

Upload `merkado_eda.ipynb` + `merkado_db.py`, then:

```python
!pip install -q sqlalchemy psycopg2-binary mlxtend statsmodels
```

Secrets sidebar → new secret `MERKADO_DB_URL` → paste the pooler string.
The notebook reads `os.environ`, so Secrets work as-is.

#### Run

```bash
jupyter notebook     # open merkado_eda.ipynb, Cell → Run All
# or in VS Code: open the .ipynb, Select Kernel → the .venv, Run All
```

If `MERKADO_DB_URL` is unset or the database is unreachable, the notebook
prints a fallback message and reads the CSV in `data/` — results then come
from sample data, not the store.

## Testing

```bash
cd merkado-app
npm run db:test        # schema + RLS + RPC tests in PGlite (171 checks)
npm test               # unit tests (Vitest)
npm run e2e            # Playwright: login, offline sale, sync, mobile viewport
npm run lint && npm run typecheck && npm run build

cd ../MerkaDo_EDA
.venv/Scripts/python -m pytest tests        # merkado_db unit tests
```

Do **not** run `supabase/tests.sql` on the real project — it writes fixture
rows. Use a throwaway test project; the PGlite harness runs it in memory.

## Weekly operation

1. Owner logs sales on the phone all week (offline is fine — outbox syncs
   when connectivity returns; `trans_id` makes retries safe).
2. Once a week, run the notebook (env var set → reads Supabase, writes
   `outputs/backup/<date>/`).
3. Copy `outputs/` into `reports/weekNN/`, print the summary for the owner.
4. `restock_next7.csv` accounts for the latest `stock_counts` entries — keep
   the Stock tab updated for it to be meaningful.

## Security notes

- **`sb_publishable_…`** is designed for browsers — safe in the app bundle
  and Vercel env. **`sb_secret_…`/`service_role`** bypasses RLS: never in the
  app, `VITE_*` vars, or Git.
- The app talks to the DB only through login-gated RPCs; anonymous access is
  denied by RLS.
- **`merkado_reader` ≠ `postgres`.** The reader can only `SELECT` reporting
  views. Keep the two passwords different — anyone holding the notebook
  string shouldn't be able to derive admin access.
- Env vars / secrets live in the registry, `.env.local`, Vercel project
  settings, or Colab Secrets — never committed files.

## Status

Implementation complete and verified (171 db tests, 42 unit tests, 6 e2e,
12 pytest, clean lint/typecheck/build). Live Supabase connection confirmed.
Pending: first real store field trial; `outputs/` so far reflect the proxy
dataset, not the actual store.
