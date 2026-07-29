import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import {
  config,
  configIssues,
  isDemo,
  isProduction,
  isServerless,
  repoRoot,
  usePostgres,
} from './config.js';
import { get, driverName, tablesExist } from './db.js';
import { ensureSeeded } from './bootstrap.js';
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

  /**
   * Deliberately catches everything. This is the endpoint you hit when the app is broken,
   * so it has to answer even when the database is unreachable or unmigrated — an opaque
   * 500 here leaves nothing to debug with.
   */
  app.get('/api/health', async (_req, res) => {
    const report = {
      ok: false,
      env: config.env,
      demo: isDemo,
      serverless: isServerless,
      driver: usePostgres ? 'postgres' : 'sqlite',
      databaseConfigured: usePostgres || !isServerless,
      schemaApplied: false,
      units: 0,
      otpEcho: config.otp.echo,
      issues: configIssues,
    };

    try {
      report.driver = await driverName();
      report.schemaApplied = await tablesExist();

      if (report.schemaApplied) {
        await ensureSeeded();
        const units = await get('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units');
        report.units = Number(units?.count ?? 0);
        report.ok = report.units > 0;
        if (!report.ok) {
          report.issues = [
            ...report.issues,
            {
              level: 'error',
              key: 'SEED',
              message:
                'Schema is in place but there is no data. POST /api/admin/seed with the ' +
                'ADMIN_TOKEN, or check the function logs for why auto-seeding failed.',
            },
          ];
        }
      } else {
        report.issues = [
          ...report.issues,
          {
            level: 'error',
            key: 'MIGRATIONS',
            message:
              'The tables do not exist. Netlify applies netlify/database/migrations before ' +
              'a production deploy publishes — check that the deploy is a production one ' +
              'and that Netlify DB is enabled for this site.',
          },
        ];
      }
    } catch (error) {
      report.issues = [
        ...report.issues,
        { level: 'error', key: 'DATABASE', message: `Database unreachable: ${error.message}` },
      ];
    }

    res.status(report.ok ? 200 : 503).json(report);
  });

  // Fill an empty demo database on the first request that needs it.
  app.use('/api', (req, _res, next) => {
    if (req.path === '/health') return next();
    ensureSeeded().then(
      () => next(),
      () => next(),
    );
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
