import { get } from './db.js';
import { isDemo } from './config.js';

/**
 * A freshly deployed site has an empty database: Netlify applies the schema through
 * migrations, but the demo estate is procedural and cannot be a .sql file.
 *
 * Rather than making someone remember to POST /api/admin/seed after every deploy, the
 * first request that finds an empty database fills it. Only in demo mode — a real
 * deployment should never invent 240 customers for itself.
 *
 * The write is a single transaction and units.code is UNIQUE, so if two cold starts race
 * one commits and the other rolls back harmlessly.
 */
let inFlight = null;
let done = false;

export async function ensureSeeded() {
  if (done || !isDemo) return { seeded: false, reason: done ? 'already-checked' : 'not-demo' };

  inFlight ??= (async () => {
    try {
      const existing = await get('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units');
      if (Number(existing?.count ?? 0) > 0) {
        done = true;
        return { seeded: false, reason: 'already-populated' };
      }

      console.log('[bootstrap] empty database — seeding the demo estate');
      const { seedDatabase } = await import('./seed.js');
      const result = await seedDatabase({ atomic: true });
      done = true;
      console.log('[bootstrap] seeded', JSON.stringify(result.counts ?? {}));
      return result;
    } catch (error) {
      // Losing a race, or a schema that has not been migrated yet. Either way this must
      // not take down the request — /api/health reports the real state.
      console.error('[bootstrap] seed skipped:', error.message);
      return { seeded: false, reason: 'error', error: error.message };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
