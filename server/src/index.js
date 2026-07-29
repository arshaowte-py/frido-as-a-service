import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config, isProduction, repoRoot } from './config.js';
import { migrate, get } from './db.js';
import { HttpError } from './util.js';
import { publicRouter } from './routes/public.js';
import { staffRouter } from './routes/staff.js';

migrate();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  const units = get('SELECT COUNT(*) AS count FROM units').count;
  res.json({ ok: true, env: config.env, units, otpEcho: config.otp.echo });
});

app.use('/api/staff', staffRouter);
app.use('/api', publicRouter);

// Built client, when it exists. `npm run build` produces it; in dev Vite serves instead.
const clientDir = path.join(repoRoot, 'web', 'dist');
if (fs.existsSync(clientDir)) {
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

app.listen(config.port, () => {
  console.log(`\n  Frido-as-a-Service API on http://localhost:${config.port}`);
  console.log(`  env=${config.env}  db=${path.relative(repoRoot, config.databaseFile)}`);
  if (config.otp.echo) {
    console.log('  DEV_OTP_ECHO is ON — OTPs are returned in API responses. Never do this in prod.\n');
  } else {
    console.log('');
  }
});
