import { Router } from 'express';
import { get } from '../db.js';
import { HttpError, timingSafeEqual, unauthorized } from '../util.js';

export const adminRouter = Router();

/**
 * Fills the hosted database with the demo estate. Netlify applies the schema via
 * migrations, but the seed is procedural, so it runs through here once after a deploy.
 *
 * Guarded by ADMIN_TOKEN. With no token configured the route is off entirely — an
 * unprotected reseed endpoint on a public URL would be a wipe button for anyone.
 */
adminRouter.post('/seed', async (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    throw new HttpError(404, 'not_found', 'No such endpoint.');
  }
  const provided = (req.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!timingSafeEqual(provided, expected)) {
    throw unauthorized('admin_auth_required', 'Bad admin token.');
  }

  // Importing here keeps the seed's demo data out of the request path's module graph
  // until someone actually asks for it.
  const { seedDatabase } = await import('../seed.js');
  const reset = req.body?.reset === true;
  const result = await seedDatabase({ reset });

  const units = await get('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units');
  res.json({ ...result, units: Number(units?.count ?? 0) });
});
