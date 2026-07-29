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

loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(serverRoot, '.env'));

const num = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value, fallback) => (value == null ? fallback : value === 'true' || value === '1');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  databaseFile: path.resolve(serverRoot, process.env.DATABASE_FILE ?? 'data/frido.db'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  otp: {
    echo: bool(process.env.DEV_OTP_ECHO, true),
    ttlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
  },
  borrow: {
    freeMinutes: num(process.env.FREE_MINUTES, 120),
    extensionMinutes: num(process.env.EXTENSION_MINUTES, 60),
    maxExtensions: num(process.env.MAX_EXTENSIONS, 2),
  },
};

export const isProduction = config.env === 'production';

if (isProduction) {
  if (config.jwtSecret === 'dev-only-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a real value when NODE_ENV=production');
  }
  if (config.otp.echo) {
    throw new Error('DEV_OTP_ECHO must be false when NODE_ENV=production');
  }
}
