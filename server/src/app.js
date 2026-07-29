import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config, isDemo, isProduction, repoRoot } from './config.js';
import { get, driverName } from './db.js';
import { HttpError } from './util.js';
import { publicRouter } from './routes/public.js';
import { staffRouter } from './routes/staff.js';
import { adminRouter } from './routes/admin.js';

/**
 * Builds the Express app. Kept separate from index.js so the same app can be mounted in a
 * Netlify Function without starting a listener.
 *
 * @param {{ serveClient?: boolean }} [options] serveClient is for the single-process
 *   deployment where the API also serves the built SPA. On Netlify the CDN does that.
 */
export function createApp({ serveClient = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', async (_req, res) => {
    const units = await get('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units');
    res.json({
      ok: true,
      env: config.env,
      demo: isDemo,
      driver: await driverName(),
      units: Number(units?.count ?? 0),
      otpEcho: config.otp.echo,
    });
  });

  app.use('/api/admin', adminRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api', publicRouter);

  const clientDir = path.join(repoRoot, 'web', 'dist');
  if (serveClient && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
    }
    next();
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    console.error('[error]', error);
    res.status(500).json({
      error: {
        code: 'internal_error',
        message: isProduction ? 'Something went wrong.' : error.message,
      },
    });
  });

  return app;
}
