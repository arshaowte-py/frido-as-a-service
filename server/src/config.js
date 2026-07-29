import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..');
export const repoRoot = path.resolve(serverRoot, '..');

// Minimal .env loader so the prototype runs with no extra dependency. Looks at the repo
// root first (shared by both workspaces), then the server folder.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

try {
  loadEnvFile(path.join(repoRoot, '.env'));
  loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  // A bundled serverless function has no repo on disk. Platform env vars are the source
  // of truth there, so a missing .env is expected rather than a problem.
}

const num = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value, fallback) => (value == null ? fallback : value === 'true' || value === '1');

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Running on Netlify (or any serverless host with a read-only filesystem). Several of
 * these are set at build time only, so all of them are checked.
 */
export const isServerless = Boolean(
  process.env.NETLIFY ||
    process.env.SITE_ID ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME,
);

const databaseUrl =
  process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || null;

/**
 * Postgres whenever a connection string exists. Explicitly overridable, but never guessed
 * from "are we on Netlify" alone — a serverless container has no writable disk, so
 * silently falling back to SQLite there produces a confusing EROFS crash instead of a
 * clear "no database configured".
 */
export const usePostgres = bool(process.env.USE_POSTGRES, Boolean(databaseUrl));

/**
 * This repo is a prototype whose whole purpose is being demoed, so demo mode is the
 * default and a real deployment opts out with DEMO_MODE=false. In demo mode the OTP is
 * returned in the API response, because there is no SMS gateway.
 */
export const isDemo = bool(process.env.DEMO_MODE, true);

/**
 * Problems worth telling a human about. Collected rather than thrown: a config mistake
 * used to take down the entire function, which surfaces to the browser as an opaque
 * "something went wrong" with nothing to go on. These are reported by /api/health.
 */
export const configIssues = [];

function resolveJwtSecret() {
  const provided = process.env.JWT_SECRET;
  if (provided && provided !== 'dev-only-insecure-secret-change-me') return provided;

  if (!isProduction && !isServerless) return 'dev-only-insecure-secret-change-me';

  // Deployed without a secret. Derive a stable per-site one so sign-in still works and
  // tokens survive across instances, but say so loudly.
  const siteIdentity = process.env.SITE_ID || process.env.SITE_NAME || process.env.URL;
  if (siteIdentity) {
    configIssues.push({
      level: 'warning',
      key: 'JWT_SECRET',
      message:
        'JWT_SECRET is not set. Tokens are signed with a key derived from this site’s ID. ' +
        'Fine for a demo; set a real JWT_SECRET before this holds anything real.',
    });
    return crypto.createHash('sha256').update(`frido-assist:${siteIdentity}`).digest('base64url');
  }

  configIssues.push({
    level: 'error',
    key: 'JWT_SECRET',
    message:
      'JWT_SECRET is not set and no site identity was found to derive one from. Sign-ins ' +
      'will not survive a cold start. Set JWT_SECRET in the site environment variables.',
  });
  return crypto.randomBytes(32).toString('base64url');
}

const otpEchoRequested = bool(process.env.DEV_OTP_ECHO, true);
const otpEcho = otpEchoRequested && (!isProduction || isDemo);

if (otpEchoRequested && !otpEcho) {
  configIssues.push({
    level: 'warning',
    key: 'DEV_OTP_ECHO',
    message:
      'OTP echo was requested but is disabled because NODE_ENV=production and DEMO_MODE=false. ' +
      'Sign-in needs a real SMS gateway in this configuration.',
  });
}

if (isProduction && isDemo) {
  configIssues.push({
    level: 'notice',
    key: 'DEMO_MODE',
    message:
      'Demo mode: one-time codes are returned in the API response instead of being texted. ' +
      'Only safe while every row behind this is synthetic. Set DEMO_MODE=false for real data.',
  });
}

if (isServerless && !usePostgres) {
  configIssues.push({
    level: 'error',
    key: 'DATABASE',
    message:
      'No database connection string found (NETLIFY_DATABASE_URL / DATABASE_URL). A ' +
      'serverless function has no writable disk, so the SQLite fallback cannot be used. ' +
      'Enable Netlify DB for this site and redeploy.',
  });
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  jwtSecret: resolveJwtSecret(),
  databaseFile: path.resolve(serverRoot, process.env.DATABASE_FILE ?? 'data/frido.db'),
  databaseUrl,
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ??
    process.env.URL ??
    'http://localhost:5173'
  ).replace(/\/$/, ''),
  otp: {
    echo: otpEcho,
    ttlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
  },
  borrow: {
    freeMinutes: num(process.env.FREE_MINUTES, 120),
    extensionMinutes: num(process.env.EXTENSION_MINUTES, 60),
    maxExtensions: num(process.env.MAX_EXTENSIONS, 2),
  },
};

export const hasBlockingConfigIssue = configIssues.some((issue) => issue.level === 'error');
