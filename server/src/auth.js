import crypto from 'node:crypto';
import { config } from './config.js';
import { get } from './db.js';
import { HttpError, unauthorized } from './util.js';

// Small HS256 JWT implementation. The prototype only needs sign + verify for two
// audiences, and this keeps the dependency list honest.
const b64url = (input) => Buffer.from(input).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

export function issueToken(payload, { audience, ttlSeconds = 60 * 60 * 12 }) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, aud: audience, iat: now, exp: now + ttlSeconds };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify(body));
  return `${head}.${claims}.${sign(`${head}.${claims}`)}`;
}

export function verifyToken(token, audience) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const [head, claims, signature] = parts;
  const expected = sign(`${head}.${claims}`);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.aud !== audience) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

const bearer = (req) => {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

/** Populates req.user when a valid guest token is present; never rejects. */
export function optionalGuest(req, _res, next) {
  const payload = verifyToken(bearer(req), 'guest');
  if (payload?.sub) {
    req.user = get('SELECT * FROM users WHERE id = ?', payload.sub);
  }
  next();
}

export function requireGuest(req, _res, next) {
  const payload = verifyToken(bearer(req), 'guest');
  if (!payload?.sub) return next(unauthorized('not_verified', 'Verify your mobile number first.'));
  const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user) return next(unauthorized('not_verified', 'Session expired. Verify again.'));
  req.user = user;
  next();
}

export function requireStaff(req, _res, next) {
  const payload = verifyToken(bearer(req), 'staff');
  if (!payload?.sub) return next(unauthorized('staff_auth_required', 'Sign in with your store PIN.'));
  const member = get('SELECT * FROM staff WHERE id = ? AND is_active = 1', payload.sub);
  if (!member) return next(unauthorized('staff_auth_required', 'Sign in with your store PIN.'));
  req.staff = member;
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return next(new HttpError(403, 'forbidden', 'Your role cannot perform this action.'));
    }
    next();
  };
}
