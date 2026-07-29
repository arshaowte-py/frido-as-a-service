import crypto from 'node:crypto';
import { run } from './db.js';

export const nowIso = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export const addMinutes = (isoOrDate, minutes) =>
  new Date(new Date(isoOrDate).getTime() + minutes * 60_000).toISOString();

export const minutesBetween = (fromIso, toIso) =>
  Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);

// Human-facing codes. No 0/O/1/I so they survive being read aloud across a store counter.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function humanCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const numericCode = (length = 6) =>
  Array.from(crypto.randomBytes(length), (byte) => byte % 10).join('');

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const normalisePhone = (raw) => String(raw ?? '').replace(/\D/g, '').slice(-10);
export const isValidIndianMobile = (phone) => /^[6-9]\d{9}$/.test(phone);

export const rupees = (paise) => Math.round((paise ?? 0) / 100);

/** Append-only funnel log. Never throws — analytics must not break the guest flow. */
export async function track(type, fields = {}) {
  try {
    await run(
      `INSERT INTO events (id, at, type, user_id, session_id, unit_id, store_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id(),
      nowIso(),
      type,
      fields.userId,
      fields.sessionId,
      fields.unitId,
      fields.storeId,
      fields.payload ? JSON.stringify(fields.payload) : null,
    );
  } catch (error) {
    console.error('[events] failed to record', type, error.message);
  }
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code, message) => new HttpError(400, code, message);
export const notFound = (code, message) => new HttpError(404, code, message);
export const conflict = (code, message) => new HttpError(409, code, message);
export const unauthorized = (code, message) => new HttpError(401, code, message);
