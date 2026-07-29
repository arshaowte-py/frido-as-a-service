import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

export const db = new DatabaseSync(config.databaseFile);

export function migrate() {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(schema);
}

// node:sqlite only binds null / number / bigint / string / Uint8Array. Normalise the
// JS values we actually use (booleans, undefined, Date) so callers don't have to.
function bind(params) {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

// Rows come back with a null prototype, which breaks spread-into-JSON in a few places.
const plain = (row) => (row ? { ...row } : row);

export const all = (sql, ...params) => db.prepare(sql).all(...bind(params)).map(plain);
export const get = (sql, ...params) => plain(db.prepare(sql).get(...bind(params))) ?? null;
export const run = (sql, ...params) => db.prepare(sql).run(...bind(params));

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
