/**
 * The schema exists twice: server/src/schema.sql is applied by the SQLite driver at boot,
 * and netlify/database/migrations/001_initial/migration.sql is applied by Netlify before a
 * production deploy publishes. They must stay identical, so this fails the build if they
 * drift.
 *
 * Changing the schema after the first production deploy means adding a NEW migration
 * directory rather than editing 001 — Netlify will not re-run an already-applied one. In
 * that case, update this script's EXPECTED_MIGRATION to the newest full-schema copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_MIGRATION = 'netlify/database/migrations/001_initial/migration.sql';

const source = path.join(repoRoot, 'server/src/schema.sql');
const migration = path.join(repoRoot, EXPECTED_MIGRATION);

if (!fs.existsSync(migration)) {
  console.error(`Missing ${EXPECTED_MIGRATION}. Copy server/src/schema.sql into it.`);
  process.exit(1);
}

const normalise = (file) => fs.readFileSync(file, 'utf8').trim().replace(/\r\n/g, '\n');

if (normalise(source) !== normalise(migration)) {
  console.error(
    `Schema drift: server/src/schema.sql and ${EXPECTED_MIGRATION} differ.\n` +
      `  cp server/src/schema.sql ${EXPECTED_MIGRATION}\n` +
      '  (or add a new migration directory if 001 has already been applied in production)',
  );
  process.exit(1);
}

console.log('schema.sql and the Netlify migration are in sync');
