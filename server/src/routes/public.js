import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { all, get, run, transaction } from '../db.js';
import { issueToken, optionalGuest, requireGuest } from '../auth.js';
import * as view from '../serialize.js';
import {
  addMinutes,
  badRequest,
  conflict,
  humanCode,
  id,
  isValidIndianMobile,
  normalisePhone,
  notFound,
  nowIso,
  numericCode,
  sha256,
  timingSafeEqual,
  track,
} from '../util.js';

export const publicRouter = Router();

const parse = (schema, payload) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest('invalid_input', `${first.path.join('.') || 'body'}: ${first.message}`);
  }
  return result.data;
};

/* ------------------------------------------------------------------ catalogue */

publicRouter.get('/products', (_req, res) => {
  res.json({ products: all('SELECT * FROM products ORDER BY category').map(view.product) });
});

publicRouter.get('/malls', (_req, res) => {
  const malls = all('SELECT * FROM malls ORDER BY city, name').map((mall) => ({
    id: mall.id,
    name: mall.name,
    city: mall.city,
    address: mall.address,
    stores: all('SELECT * FROM stores WHERE mall_id = ? AND is_active = 1', mall.id).map((s) =>
      view.store(s, mall),
    ),
  }));
  res.json({ malls });
});

/* ------------------------------------------------------------- the QR entry point */

// Sticker on the physical unit. This is the equivalent of walking up to a Yulu bike.
publicRouter.get('/scan/:qrToken', optionalGuest, (req, res, next) => {
  const unitRow = get('SELECT * FROM units WHERE qr_token = ?', req.params.qrToken);
  if (!unitRow) return next(notFound('unknown_unit', 'This QR code is not registered yet.'));

  const storeRow = get('SELECT * FROM stores WHERE id = ?', unitRow.store_id);
  const productRow = get('SELECT * FROM products WHERE id = ?', unitRow.product_id);

  track('scan', {
    unitId: unitRow.id,
    storeId: unitRow.store_id,
    userId: req.user?.id,
    payload: { status: unitRow.status },
  });

  // If this unit is already out, offer a sibling that is free rather than a dead end.
  const alternatives =
    unitRow.status === 'available'
      ? []
      : all(
          `SELECT * FROM units
            WHERE store_id = ? AND product_id = ? AND status = 'available' AND id != ?
            ORDER BY lifetime_sessions LIMIT 3`,
          unitRow.store_id,
          unitRow.product_id,
          unitRow.id,
        ).map((row) => view.unit(row, { includeToken: true }));

  res.json({
    unit: view.unit(unitRow, { product: view.product(productRow) }),
    product: view.product(productRow),
    store: view.store(storeRow),
    policy: view.policy(),
    alternatives,
    activeSession: req.user ? currentSessionFor(req.user.id) : null,
  });
});

// Same payload as /scan but without logging a scan — used by the screens that come after
// the sticker, so a page refresh doesn't inflate the top of the funnel.
publicRouter.get('/units/:id', (req, res, next) => {
  const unitRow = get('SELECT * FROM units WHERE id = ?', req.params.id);
  if (!unitRow) return next(notFound('unknown_unit', 'That unit is not registered.'));
  res.json({
    unit: view.unit(unitRow),
    product: view.product(get('SELECT * FROM products WHERE id = ?', unitRow.product_id)),
    store: view.store(get('SELECT * FROM stores WHERE id = ?', unitRow.store_id)),
    policy: view.policy(),
  });
});

// Standee QR at the store entrance: pick from whatever is free right now.
publicRouter.get('/stores/:storeId/availability', (req, res, next) => {
  const storeRow = get('SELECT * FROM stores WHERE id = ?', req.params.storeId);
  if (!storeRow) return next(notFound('unknown_store', 'No such Frido store.'));

  const products = all('SELECT * FROM products ORDER BY category').map((productRow) => {
    const units = all(
      `SELECT * FROM units
        WHERE store_id = ? AND product_id = ? AND status = 'available'
        ORDER BY lifetime_sessions`,
      storeRow.id,
      productRow.id,
    );
    return {
      product: view.product(productRow),
      availableCount: units.length,
      units: units.map((row) => view.unit(row, { includeToken: true })),
    };
  });

  track('store_scan', { storeId: storeRow.id });
  res.json({ store: view.store(storeRow), policy: view.policy(), products });
});

/* --------------------------------------------------------------------- otp login */

// Crude per-process throttle. A real deployment puts this in Redis with the SMS vendor's
// own rate limits behind it.
const otpAttemptWindow = new Map();
function throttleOtp(phone) {
  const now = Date.now();
  const hits = (otpAttemptWindow.get(phone) ?? []).filter((at) => now - at < 60 * 60_000);
  if (hits.length >= 5) {
    throw conflict('otp_rate_limited', 'Too many codes requested. Try again in an hour.');
  }
  hits.push(now);
  otpAttemptWindow.set(phone, hits);
}

publicRouter.post('/auth/otp/request', (req, res) => {
  const body = parse(z.object({ phone: z.string() }), req.body);
  const phone = normalisePhone(body.phone);
  if (!isValidIndianMobile(phone)) {
    throw badRequest('invalid_phone', 'Enter a valid 10-digit Indian mobile number.');
  }
  throttleOtp(phone);

  const code = numericCode(6);
  const challengeId = id();
  run(
    `INSERT INTO otp_challenges (id, phone, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    challengeId,
    phone,
    sha256(code),
    addMinutes(nowIso(), config.otp.ttlSeconds / 60),
    nowIso(),
  );

  track('otp_requested', { payload: { phone } });

  if (config.otp.echo) {
    console.log(`[otp] ${phone} -> ${code}  (DEV_OTP_ECHO is on; no SMS was sent)`);
  }

  res.json({
    challengeId,
    phone,
    expiresInSeconds: config.otp.ttlSeconds,
    // Present only while DEV_OTP_ECHO is on, so the prototype can be demoed solo.
    devCode: config.otp.echo ? code : undefined,
  });
});

publicRouter.post('/auth/otp/verify', (req, res) => {
  const body = parse(
    z.object({ challengeId: z.string(), code: z.string().min(4).max(8) }),
    req.body,
  );

  const challenge = get('SELECT * FROM otp_challenges WHERE id = ?', body.challengeId);
  if (!challenge) throw badRequest('unknown_challenge', 'Request a fresh code.');
  if (challenge.consumed_at) throw badRequest('code_used', 'That code was already used.');
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw badRequest('code_expired', 'That code expired. Request a new one.');
  }
  if (challenge.attempts >= config.otp.maxAttempts) {
    throw conflict('too_many_attempts', 'Too many wrong attempts. Request a new code.');
  }

  if (!timingSafeEqual(sha256(body.code), challenge.code_hash)) {
    run('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', challenge.id);
    throw badRequest('wrong_code', 'That code is not right.');
  }
  run('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', nowIso(), challenge.id);

  let userRow = get('SELECT * FROM users WHERE phone = ?', challenge.phone);
  const isNew = !userRow;
  if (isNew) {
    const userId = id();
    run(
      'INSERT INTO users (id, phone, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
      userId,
      challenge.phone,
      nowIso(),
      nowIso(),
    );
    run(
      'INSERT INTO lead_profiles (user_id, followup_status, updated_at) VALUES (?, ?, ?)',
      userId,
      'new',
      nowIso(),
    );
    userRow = get('SELECT * FROM users WHERE id = ?', userId);
  } else {
    run('UPDATE users SET last_seen_at = ? WHERE id = ?', nowIso(), userRow.id);
  }

  track(isNew ? 'lead_created' : 'otp_verified', { userId: userRow.id, payload: { isNew } });

  res.json({
    token: issueToken({ sub: userRow.id }, { audience: 'guest' }),
    user: view.user(userRow),
    profile: view.leadProfile(get('SELECT * FROM lead_profiles WHERE user_id = ?', userRow.id)),
    isNew,
    activeSession: currentSessionFor(userRow.id),
  });
});

/* ------------------------------------------------------------------- guest profile */

publicRouter.get('/me', requireGuest, (req, res) => {
  res.json({
    user: view.user(req.user),
    profile: view.leadProfile(get('SELECT * FROM lead_profiles WHERE user_id = ?', req.user.id)),
    activeSession: currentSessionFor(req.user.id),
    sessions: all(
      'SELECT * FROM borrow_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      req.user.id,
    ).map((row) => view.borrowSession(row)),
    offers: all(
      'SELECT * FROM offers WHERE user_id = ? ORDER BY created_at DESC',
      req.user.id,
    ).map(view.offer),
  });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal('')),
  city: z.string().trim().max(60).optional(),
  whatsappOptIn: z.boolean().optional(),
  primaryInterest: z.string().max(40).optional(),
  needType: z.string().max(60).optional(),
  childAgeMonths: z.number().int().min(0).max(144).nullable().optional(),
  mobilityNeed: z.string().max(60).optional(),
  buyingIntent: z.enum(['just_borrowing', 'curious', 'considering', 'ready_to_buy']).optional(),
});

// The trade at the heart of the product: they tell us who they are, we hand over a unit.
publicRouter.patch('/me/profile', requireGuest, (req, res) => {
  const body = parse(profileSchema, req.body);

  run(
    `UPDATE users SET name = ?, email = ?, city = ?, whatsapp_opt_in = ?, last_seen_at = ?
      WHERE id = ?`,
    body.name,
    body.email || null,
    body.city ?? req.user.city,
    body.whatsappOptIn ?? Boolean(req.user.whatsapp_opt_in),
    nowIso(),
    req.user.id,
  );

  const existing = get('SELECT * FROM lead_profiles WHERE user_id = ?', req.user.id);
  const merged = {
    primary_interest: body.primaryInterest ?? existing?.primary_interest ?? null,
    need_type: body.needType ?? existing?.need_type ?? null,
    child_age_months:
      body.childAgeMonths === undefined ? (existing?.child_age_months ?? null) : body.childAgeMonths,
    mobility_need: body.mobilityNeed ?? existing?.mobility_need ?? null,
    buying_intent: body.buyingIntent ?? existing?.buying_intent ?? null,
  };

  if (existing) {
    run(
      `UPDATE lead_profiles
          SET primary_interest = ?, need_type = ?, child_age_months = ?, mobility_need = ?,
              buying_intent = ?, updated_at = ?
        WHERE user_id = ?`,
      merged.primary_interest,
      merged.need_type,
      merged.child_age_months,
      merged.mobility_need,
      merged.buying_intent,
      nowIso(),
      req.user.id,
    );
  } else {
    run(
      `INSERT INTO lead_profiles
         (user_id, primary_interest, need_type, child_age_months, mobility_need, buying_intent,
          followup_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
      req.user.id,
      merged.primary_interest,
      merged.need_type,
      merged.child_age_months,
      merged.mobility_need,
      merged.buying_intent,
      nowIso(),
    );
  }

  track('profile_completed', { userId: req.user.id, payload: merged });

  res.json({
    user: view.user(get('SELECT * FROM users WHERE id = ?', req.user.id)),
    profile: view.leadProfile(get('SELECT * FROM lead_profiles WHERE user_id = ?', req.user.id)),
  });
});

/* ----------------------------------------------------------------- borrow sessions */

function currentSessionFor(userId) {
  const row = get(
    `SELECT * FROM borrow_sessions
      WHERE user_id = ? AND status IN ('pending', 'active')
      ORDER BY created_at DESC LIMIT 1`,
    userId,
  );
  return row ? view.borrowSession(row) : null;
}

function loadOwnSession(req) {
  const row = get('SELECT * FROM borrow_sessions WHERE id = ?', req.params.id);
  if (!row || row.user_id !== req.user.id) {
    throw notFound('unknown_session', 'We could not find that booking.');
  }
  return row;
}

publicRouter.post('/sessions', requireGuest, (req, res) => {
  const body = parse(
    z.object({
      unitId: z.string().optional(),
      qrToken: z.string().optional(),
      purpose: z.string().max(80).optional(),
      partySize: z.number().int().min(1).max(10).optional(),
      depositType: z.enum(['id_card', 'none']).default('id_card'),
      termsAccepted: z.literal(true),
    }),
    req.body,
  );

  if (!req.user.name) {
    throw badRequest('profile_required', 'Tell us your name before picking up a unit.');
  }
  if (currentSessionFor(req.user.id)) {
    throw conflict('already_borrowing', 'You already have a unit out. Return it first.');
  }

  const unitRow = body.unitId
    ? get('SELECT * FROM units WHERE id = ?', body.unitId)
    : get('SELECT * FROM units WHERE qr_token = ?', body.qrToken ?? '');
  if (!unitRow) throw notFound('unknown_unit', 'That unit is not registered.');
  if (unitRow.status !== 'available') {
    throw conflict('unit_unavailable', 'Someone just took this one. Pick another.');
  }

  const sessionId = id();
  const ref = humanCode(6);
  const unlockCode = humanCode(4);

  transaction(() => {
    // Guard against two guests reserving the same unit between the read above and here.
    const claimed = run(
      `UPDATE units SET status = 'reserved' WHERE id = ? AND status = 'available'`,
      unitRow.id,
    );
    if (claimed.changes === 0) {
      throw conflict('unit_unavailable', 'Someone just took this one. Pick another.');
    }
    run(
      `INSERT INTO borrow_sessions
         (id, ref, user_id, unit_id, store_id, status, unlock_code, purpose, party_size,
          deposit_type, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      sessionId,
      ref,
      req.user.id,
      unitRow.id,
      unitRow.store_id,
      unlockCode,
      body.purpose ?? null,
      body.partySize ?? null,
      body.depositType,
      nowIso(),
    );
  });

  track('session_reserved', {
    userId: req.user.id,
    sessionId,
    unitId: unitRow.id,
    storeId: unitRow.store_id,
    payload: { purpose: body.purpose },
  });

  res.status(201).json({
    session: view.borrowSession(get('SELECT * FROM borrow_sessions WHERE id = ?', sessionId)),
  });
});

publicRouter.get('/sessions/:id', requireGuest, (req, res) => {
  res.json({ session: view.borrowSession(loadOwnSession(req)) });
});

/**
 * Hands the unit over. In a staffed store the associate does this from the console after
 * checking the unlock code; the guest-facing route exists so the prototype can be walked
 * through end to end by one person.
 */
export function startSession(sessionRow, { by }) {
  if (sessionRow.status !== 'pending') {
    throw conflict('not_pending', 'This booking is not waiting for handover.');
  }
  const startedAt = nowIso();
  transaction(() => {
    run(
      `UPDATE borrow_sessions SET status = 'active', started_at = ?, due_at = ? WHERE id = ?`,
      startedAt,
      addMinutes(startedAt, config.borrow.freeMinutes),
      sessionRow.id,
    );
    run(`UPDATE units SET status = 'in_use' WHERE id = ?`, sessionRow.unit_id);
  });
  track('session_started', {
    userId: sessionRow.user_id,
    sessionId: sessionRow.id,
    unitId: sessionRow.unit_id,
    storeId: sessionRow.store_id,
    payload: { by },
  });
  return get('SELECT * FROM borrow_sessions WHERE id = ?', sessionRow.id);
}

publicRouter.post('/sessions/:id/start', requireGuest, (req, res) => {
  const updated = startSession(loadOwnSession(req), { by: 'guest' });
  res.json({ session: view.borrowSession(updated) });
});

publicRouter.post('/sessions/:id/extend', requireGuest, (req, res) => {
  const sessionRow = loadOwnSession(req);
  if (sessionRow.status !== 'active') throw conflict('not_active', 'This session is not running.');
  if (sessionRow.extensions >= config.borrow.maxExtensions) {
    throw conflict('extension_limit', 'You have used all your extensions. Talk to our store team.');
  }
  // Extend from now when already overdue, otherwise from the existing due time.
  const base =
    new Date(sessionRow.due_at).getTime() < Date.now() ? nowIso() : sessionRow.due_at;
  run(
    'UPDATE borrow_sessions SET due_at = ?, extensions = extensions + 1 WHERE id = ?',
    addMinutes(base, config.borrow.extensionMinutes),
    sessionRow.id,
  );
  track('session_extended', {
    userId: req.user.id,
    sessionId: sessionRow.id,
    storeId: sessionRow.store_id,
    payload: { extension: sessionRow.extensions + 1 },
  });
  res.json({
    session: view.borrowSession(get('SELECT * FROM borrow_sessions WHERE id = ?', sessionRow.id)),
  });
});

/** Guest signals they're walking back — the store gets a heads-up on the live board. */
publicRouter.post('/sessions/:id/return-intent', requireGuest, (req, res) => {
  const sessionRow = loadOwnSession(req);
  if (sessionRow.status !== 'active') throw conflict('not_active', 'This session is not running.');
  track('return_intent', {
    userId: req.user.id,
    sessionId: sessionRow.id,
    unitId: sessionRow.unit_id,
    storeId: sessionRow.store_id,
  });
  res.json({
    session: view.borrowSession(sessionRow),
    returnTo: view.store(get('SELECT * FROM stores WHERE id = ?', sessionRow.store_id)),
  });
});

export function completeSession(sessionRow, { by, condition }) {
  if (sessionRow.status !== 'active' && sessionRow.status !== 'pending') {
    throw conflict('not_returnable', 'This session is already closed.');
  }
  const endedAt = nowIso();
  const productRow = get(
    'SELECT p.* FROM products p JOIN units u ON u.product_id = p.id WHERE u.id = ?',
    sessionRow.unit_id,
  );

  const offerId = id();
  const offerCode = `MALL${humanCode(4)}`;

  transaction(() => {
    run(
      `UPDATE borrow_sessions
          SET status = 'completed', ended_at = ?, return_condition = ?,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
      endedAt,
      condition ?? 'good',
      endedAt,
      sessionRow.id,
    );
    run(
      `UPDATE units
          SET status = CASE WHEN ? = 'damaged' THEN 'maintenance' ELSE 'available' END,
              lifetime_sessions = lifetime_sessions + 1,
              condition_note = CASE WHEN ? = 'damaged' THEN ? ELSE condition_note END
        WHERE id = ?`,
      condition ?? 'good',
      condition ?? 'good',
      `Flagged on return of ${sessionRow.ref}`,
      sessionRow.unit_id,
    );
    // The conversion hook: a mall-only code that is worth using before they leave.
    run(
      `INSERT INTO offers (id, code, user_id, session_id, product_id, discount_pct, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      offerId,
      offerCode,
      sessionRow.user_id,
      sessionRow.id,
      productRow.id,
      10,
      addMinutes(endedAt, 7 * 24 * 60),
      endedAt,
    );
  });

  track('session_completed', {
    userId: sessionRow.user_id,
    sessionId: sessionRow.id,
    unitId: sessionRow.unit_id,
    storeId: sessionRow.store_id,
    payload: { by, condition: condition ?? 'good' },
  });
  track('offer_issued', {
    userId: sessionRow.user_id,
    sessionId: sessionRow.id,
    storeId: sessionRow.store_id,
    payload: { code: offerCode, discountPct: 10 },
  });

  return {
    session: get('SELECT * FROM borrow_sessions WHERE id = ?', sessionRow.id),
    offer: get('SELECT * FROM offers WHERE id = ?', offerId),
  };
}

publicRouter.post('/sessions/:id/complete', requireGuest, (req, res) => {
  const body = parse(
    z.object({ condition: z.enum(['good', 'damaged']).default('good') }),
    req.body ?? {},
  );
  const result = completeSession(loadOwnSession(req), { by: 'guest', condition: body.condition });
  res.json({ session: view.borrowSession(result.session), offer: view.offer(result.offer) });
});

publicRouter.post('/sessions/:id/cancel', requireGuest, (req, res) => {
  const sessionRow = loadOwnSession(req);
  if (sessionRow.status !== 'pending') {
    throw conflict('not_cancellable', 'Only a booking awaiting handover can be cancelled.');
  }
  transaction(() => {
    run(`UPDATE borrow_sessions SET status = 'cancelled', ended_at = ? WHERE id = ?`, nowIso(), sessionRow.id);
    run(`UPDATE units SET status = 'available' WHERE id = ?`, sessionRow.unit_id);
  });
  track('session_cancelled', {
    userId: req.user.id,
    sessionId: sessionRow.id,
    storeId: sessionRow.store_id,
  });
  res.json({
    session: view.borrowSession(get('SELECT * FROM borrow_sessions WHERE id = ?', sessionRow.id)),
  });
});

publicRouter.post('/sessions/:id/feedback', requireGuest, (req, res) => {
  const body = parse(
    z.object({
      rating: z.number().int().min(1).max(5),
      feedback: z.string().max(500).optional(),
      buyingIntent: z.enum(['just_borrowing', 'curious', 'considering', 'ready_to_buy']).optional(),
    }),
    req.body,
  );
  const sessionRow = loadOwnSession(req);

  run(
    'UPDATE borrow_sessions SET rating = ?, feedback = ? WHERE id = ?',
    body.rating,
    body.feedback ?? null,
    sessionRow.id,
  );
  if (body.buyingIntent) {
    run(
      'UPDATE lead_profiles SET buying_intent = ?, updated_at = ? WHERE user_id = ?',
      body.buyingIntent,
      nowIso(),
      req.user.id,
    );
  }

  track('feedback_given', {
    userId: req.user.id,
    sessionId: sessionRow.id,
    storeId: sessionRow.store_id,
    payload: { rating: body.rating, buyingIntent: body.buyingIntent },
  });

  res.json({
    session: view.borrowSession(get('SELECT * FROM borrow_sessions WHERE id = ?', sessionRow.id)),
    profile: view.leadProfile(get('SELECT * FROM lead_profiles WHERE user_id = ?', req.user.id)),
  });
});
