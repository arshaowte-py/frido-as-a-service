/**
 * One async data-access interface, two drivers.
 *
 *   local dev / tests → node:sqlite, a file under server/data. Zero setup.
 *   Netlify           → Postgres (Netlify DB), because a serverless function has no
 *                       durable disk and instances don't share one.
 *
 * The SQL in this project is written to run unchanged on both. That means:
 *   - `?` placeholders (the Postgres driver rewrites them to $1..$n)
 *   - CAST(... AS INTEGER) / CAST(... AS REAL) around aggregates, so Postgres doesn't
 *     hand back bigint/numeric as strings
 *   - substr(ts, 1, 10) rather than date(), since timestamps are ISO-8601 text
 *   - every non-aggregated column listed in GROUP BY, which Postgres requires
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { config, usePostgres } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// node:sqlite only binds null / number / bigint / string / Uint8Array, and pg is happier
// with the same normalisation. Booleans, undefined and Date are the ones we actually use.
function normalise(params) {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

const plain = (row) => (row ? { ...row } : row);

/* ------------------------------------------------------------------ sqlite driver */

function createSqliteDriver() {
  // Imported lazily so bundling for Netlify never pulls in node:sqlite.
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  const handle = new DatabaseSync(config.databaseFile);
  // Kept out of schema.sql so that file stays valid Postgres too.
  handle.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const exec = (sql) => handle.exec(sql);
  const query = (sql, params) => handle.prepare(sql).all(...normalise(params)).map(plain);
  const queryOne = (sql, params) => plain(handle.prepare(sql).get(...normalise(params))) ?? null;
  const execute = (sql, params) => {
    const result = handle.prepare(sql).run(...normalise(params));
    return { changes: result.changes };
  };

  return {
    name: 'sqlite',
    all: async (sql, params) => query(sql, params),
    get: async (sql, params) => queryOne(sql, params),
    run: async (sql, params) => execute(sql, params),
    exec: async (sql) => exec(sql),
    async transaction(fn) {
      exec('BEGIN');
      try {
        const result = await fn({
          all: async (sql, ...params) => query(sql, params),
          get: async (sql, ...params) => queryOne(sql, params),
          run: async (sql, ...params) => execute(sql, params),
        });
        exec('COMMIT');
        return result;
      } catch (error) {
        exec('ROLLBACK');
        throw error;
      }
    },
    async migrate() {
      exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
    },
    async close() {
      handle.close();
    },
  };
}

/* ---------------------------------------------------------------- postgres driver */

/** `SELECT ... WHERE a = ? AND b = ?` → `... WHERE a = $1 AND b = $2`. */
function toPositional(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
}

async function createPostgresDriver() {
  const { getDatabase } = await import('@netlify/database');
  const database = getDatabase();
  const pool = database.pool;

  const runOn = async (client, sql, params) => {
    const result = await client.query(toPositional(sql), normalise(params));
    return result;
  };

  return {
    name: 'postgres',
    all: async (sql, params) => (await runOn(pool, sql, params)).rows.map(plain),
    get: async (sql, params) => plain((await runOn(pool, sql, params)).rows[0]) ?? null,
    run: async (sql, params) => ({ changes: (await runOn(pool, sql, params)).rowCount ?? 0 }),
    exec: async (sql) => {
      await pool.query(sql);
    },
    // A pool hands out a different connection per query, so a transaction has to pin one
    // and every statement inside it must go through the handle passed to the callback.
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          all: async (sql, ...params) => (await runOn(client, sql, params)).rows.map(plain),
          get: async (sql, ...params) => plain((await runOn(client, sql, params)).rows[0]) ?? null,
          run: async (sql, ...params) => ({
            changes: (await runOn(client, sql, params)).rowCount ?? 0,
          }),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async migrate() {
      // On Netlify the schema is applied by netlify/database/migrations before the deploy
      // publishes, so there is nothing to do at boot.
    },
    async close() {
      await pool.end();
    },
  };
}

/* --------------------------------------------------------------------- public API */

let driverPromise = null;

function driver() {
  if (!driverPromise) {
    driverPromise = usePostgres
      ? createPostgresDriver()
      : Promise.resolve(createSqliteDriver());
  }
  return driverPromise;
}

/**
 * Multi-row INSERT, chunked. Seeding is thousands of rows; one statement per row is fine
 * against a local file and unusably slow against a network database.
 *
 * Chunk size keeps the parameter count under Postgres's 65535 limit.
 */
export async function bulkInsert(table, columns, rows) {
  if (rows.length === 0) return 0;
  const perChunk = Math.max(1, Math.floor(60000 / columns.length));
  const placeholder = `(${columns.map(() => '?').join(', ')})`;
  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += perChunk) {
    const chunk = rows.slice(offset, offset + perChunk);
    const sql =
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ` +
      chunk.map(() => placeholder).join(', ');
    await run(sql, ...chunk.flat());
    inserted += chunk.length;
  }
  return inserted;
}

export const all = async (sql, ...params) => (await driver()).all(sql, params);
export const get = async (sql, ...params) => (await driver()).get(sql, params);
export const run = async (sql, ...params) => (await driver()).run(sql, params);
export const exec = async (sql) => (await driver()).exec(sql);
export const transaction = async (fn) => (await driver()).transaction(fn);
export const migrate = async () => (await driver()).migrate();
export const driverName = async () => (await driver()).name;
