// PGlite-based schema test runner (CONTRACT.md §2.5).
// Runs stub.sql -> schema.sql -> seed_products.sql -> tests.sql in a fresh
// in-memory Postgres and counts "PASS:" notices emitted by tests.sql.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  join(here, 'stub.sql'),
  join(here, '..', 'schema.sql'),
  join(here, '..', 'seed_products.sql'),
  join(here, '..', 'tests.sql'),
];

let passCount = 0;
const onNotice = (n) => {
  console.log(`  ${n.severity}: ${n.message}`);
  if (typeof n.message === 'string' && n.message.startsWith('PASS:')) passCount++;
};

const db = new PGlite();
await db.waitReady;

for (const file of files) {
  const name = file.split(/[\\/]/).pop();
  console.log(`== ${name}`);
  let sql;
  try {
    sql = await readFile(file, 'utf8');
  } catch {
    console.error(`db:test: cannot read ${file} — file missing?`);
    process.exit(1);
  }
  try {
    await db.exec(sql, { onNotice });
  } catch (err) {
    console.error(`== ${name} FAILED`);
    console.error(err.message);
    for (const k of ['detail', 'hint', 'where', 'position']) {
      if (err[k]) console.error(`${k}: ${err[k]}`);
    }
    process.exit(1);
  }
}

await db.close();
console.log(`db:test: ${passCount} PASS, all checks passed`);
process.exit(0);
