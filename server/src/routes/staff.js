import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { all, get, run } from '../db.js';
import { issueToken, requireRole, requireStaff } from '../auth.js';
import * as view from '../serialize.js';
import {
  badRequest,
  conflict,
  humanCode,
  id,
  normalisePhone,
  notFound,
  nowIso,
  timingSafeEqual,
  track,
} from '../util.js';
import { completeSession, startSession } from './public.js';

export const staffRouter = Router();

const parse = (schema, payload) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest('invalid_input', `${first.path.join('.') || 'body'}: ${first.message}`);
  }
  return result.data;
};

/* -------------------------------------------------------------------------- login */

staffRouter.post('/login', (req, res) => {
  const body = parse(z.object({ phone: z.string(), pin: z.string() }), req.body);
  const member = get(
    'SELECT * FROM staff WHERE phone = ? AND is_active = 1',
    normalisePhone(body.phone),
  );
  if (!member || !timingSafeEqual(member.pin, body.pin)) {
    throw badRequest('bad_credentials', 'That phone and PIN combination did not work.');
  }
  track('staff_login', { storeId: member.store_id, payload: { staffId: member.id } });
  res.json({
    token: issueToken({ sub: member.id }, { audience: 'staff', ttlSeconds: 60 * 60 * 10 }),
    staff: view.staffMember(member),
  });
});

// Printable sticker for the physical unit. An <img> tag cannot send an Authorization
// header, so this one route also accepts the staff token as a query parameter. It is
// declared before the blanket requireStaff below.
staffRouter.get('/units/:id/qr.svg', (req, res, next) => {
  if (req.query.t && !req.get('authorization')) req.headers.authorization = `Bearer ${req.query.t}`;
  requireStaff(req, res, next);
}, async (req, res) => {
  const unitRow = get('SELECT * FROM units WHERE id = ?', req.params.id);
  if (!unitRow) throw notFound('unknown_unit', 'No such unit.');
  const svg = await QRCode.toString(`${config.publicBaseUrl}/s/${unitRow.qr_token}`, {
    type: 'svg',
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
  });
  res.type('image/svg+xml').set('Cache-Control', 'private, max-age=3600').send(svg);
});

staffRouter.use(requireStaff);

staffRouter.get('/me', (req, res) => res.json({ staff: view.staffMember(req.staff) }));

// Admins see the whole estate; everyone else is scoped to their own store.
const scopeStoreId = (req) =>
  req.staff.role === 'admin' ? (req.query.storeId ?? null) : req.staff.store_id;

/* ---------------------------------------------------------------------- live board */

staffRouter.get('/overview', (req, res) => {
  const storeId = scopeStoreId(req);
  const scope = storeId ? 'AND s.store_id = ?' : '';
  const args = storeId ? [storeId] : [];

  const liveRows = all(
    `SELECT s.* FROM borrow_sessions s
      WHERE s.status IN ('pending', 'active') ${scope}
      ORDER BY s.due_at IS NULL, s.due_at`,
    ...args,
  );

  const live = liveRows.map((row) => ({
    ...view.borrowSession(row),
    guest: view.user(get('SELECT * FROM users WHERE id = ?', row.user_id)),
  }));

  const fleet = all(
    `SELECT status, COUNT(*) AS count FROM units
      WHERE 1 = 1 ${storeId ? 'AND store_id = ?' : ''}
      GROUP BY status`,
    ...args,
  ).reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {});

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = get(
    `SELECT
       COUNT(*) AS sessions,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
     FROM borrow_sessions s
     WHERE date(s.created_at) = ? ${scope}`,
    today,
    ...args,
  );

  const newLeadsToday = get(
    `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN borrow_sessions s ON s.user_id = u.id
      WHERE date(u.created_at) = ? ${scope}`,
    today,
    ...args,
  );

  res.json({
    live,
    overdueCount: live.filter((item) => item.isOverdue).length,
    awaitingHandover: live.filter((item) => item.status === 'pending').length,
    fleet: {
      available: fleet.available ?? 0,
      reserved: fleet.reserved ?? 0,
      inUse: fleet.in_use ?? 0,
      maintenance: fleet.maintenance ?? 0,
      retired: fleet.retired ?? 0,
    },
    today: {
      sessions: todayStats?.sessions ?? 0,
      completed: todayStats?.completed ?? 0,
      newLeads: newLeadsToday?.count ?? 0,
    },
  });
});

/* --------------------------------------------------------------------------- fleet */

staffRouter.get('/units', (req, res) => {
  const storeId = scopeStoreId(req);
  const rows = all(
    `SELECT * FROM units ${storeId ? 'WHERE store_id = ?' : ''} ORDER BY code`,
    ...(storeId ? [storeId] : []),
  );
  res.json({
    units: rows.map((row) => ({
      ...view.unit(row, { includeToken: true }),
      store: view.store(get('SELECT * FROM stores WHERE id = ?', row.store_id)),
      currentSession: (() => {
        const live = get(
          `SELECT * FROM borrow_sessions WHERE unit_id = ? AND status IN ('pending','active')`,
          row.id,
        );
        if (!live) return null;
        return {
          ...view.borrowSession(live),
          guest: view.user(get('SELECT * FROM users WHERE id = ?', live.user_id)),
        };
      })(),
    })),
  });
});

staffRouter.patch('/units/:id', (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(['available', 'maintenance', 'retired']).optional(),
      conditionNote: z.string().max(200).nullable().optional(),
    }),
    req.body,
  );
  const unitRow = get('SELECT * FROM units WHERE id = ?', req.params.id);
  if (!unitRow) throw notFound('unknown_unit', 'No such unit.');
  if (body.status && ['reserved', 'in_use'].includes(unitRow.status)) {
    throw conflict('unit_busy', 'Close the running session before changing this unit.');
  }
  run(
    'UPDATE units SET status = COALESCE(?, status), condition_note = ?, last_serviced_at = ? WHERE id = ?',
    body.status ?? null,
    body.conditionNote === undefined ? unitRow.condition_note : body.conditionNote,
    body.status === 'available' ? nowIso() : unitRow.last_serviced_at,
    unitRow.id,
  );
  track('unit_updated', {
    unitId: unitRow.id,
    storeId: unitRow.store_id,
    payload: { ...body, staffId: req.staff.id },
  });
  res.json({ unit: view.unit(get('SELECT * FROM units WHERE id = ?', unitRow.id), { includeToken: true }) });
});

staffRouter.post('/units', requireRole('store_lead', 'admin'), async (req, res) => {
  const body = parse(
    z.object({ productId: z.string(), storeId: z.string().optional(), count: z.number().int().min(1).max(20).default(1) }),
    req.body,
  );
  const storeId = body.storeId ?? req.staff.store_id;
  const storeRow = get('SELECT * FROM stores WHERE id = ?', storeId);
  const productRow = get('SELECT * FROM products WHERE id = ?', body.productId);
  if (!storeRow || !productRow) throw notFound('unknown_target', 'Unknown store or product.');

  const prefix = productRow.category === 'stroller' ? 'STR' : 'WCH';
  const created = [];
  for (let i = 0; i < body.count; i += 1) {
    const seq = get(
      'SELECT COUNT(*) AS count FROM units WHERE store_id = ? AND product_id = ?',
      storeId,
      productRow.id,
    ).count;
    const unitId = id();
    run(
      `INSERT INTO units (id, code, qr_token, product_id, store_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'available', ?)`,
      unitId,
      `FRD-${storeRow.code}-${prefix}-${String(seq + 1 + i).padStart(3, '0')}`,
      `u_${humanCode(10).toLowerCase()}`,
      productRow.id,
      storeId,
      nowIso(),
    );
    created.push(view.unit(get('SELECT * FROM units WHERE id = ?', unitId), { includeToken: true }));
  }
  res.status(201).json({ units: created });
});

/* ---------------------------------------------------------------- session handling */

staffRouter.post('/sessions/:id/handover', (req, res) => {
  const body = parse(z.object({ unlockCode: z.string() }), req.body);
  const sessionRow = get('SELECT * FROM borrow_sessions WHERE id = ?', req.params.id);
  if (!sessionRow) throw notFound('unknown_session', 'No such booking.');
  if (!timingSafeEqual(sessionRow.unlock_code, body.unlockCode.trim().toUpperCase())) {
    throw badRequest('bad_unlock_code', 'That code does not match this booking.');
  }
  const updated = startSession(sessionRow, { by: `staff:${req.staff.id}` });
  res.json({ session: view.borrowSession(updated) });
});

staffRouter.post('/sessions/:id/receive', (req, res) => {
  const body = parse(
    z.object({ condition: z.enum(['good', 'damaged']).default('good') }),
    req.body ?? {},
  );
  const sessionRow = get('SELECT * FROM borrow_sessions WHERE id = ?', req.params.id);
  if (!sessionRow) throw notFound('unknown_session', 'No such booking.');
  const result = completeSession(sessionRow, {
    by: `staff:${req.staff.id}`,
    condition: body.condition,
  });
  res.json({ session: view.borrowSession(result.session), offer: view.offer(result.offer) });
});

/* --------------------------------------------------------------------------- leads */

function leadRows(req) {
  const storeId = scopeStoreId(req);
  const status = req.query.status;
  const search = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;

  const clauses = [];
  const args = [];
  if (storeId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM borrow_sessions bs WHERE bs.user_id = u.id AND bs.store_id = ?)',
    );
    args.push(storeId);
  }
  if (status) {
    clauses.push('lp.followup_status = ?');
    args.push(status);
  }
  if (search) {
    clauses.push('(lower(COALESCE(u.name, \'\')) LIKE ? OR u.phone LIKE ?)');
    args.push(search, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return all(
    `SELECT u.*, lp.primary_interest, lp.need_type, lp.child_age_months, lp.mobility_need,
            lp.buying_intent, lp.followup_status, lp.owner_staff_id, lp.notes,
            lp.updated_at AS profile_updated_at,
            (SELECT COUNT(*) FROM borrow_sessions bs WHERE bs.user_id = u.id) AS session_count,
            (SELECT MAX(bs.created_at) FROM borrow_sessions bs WHERE bs.user_id = u.id) AS last_session_at,
            (SELECT AVG(bs.rating) FROM borrow_sessions bs WHERE bs.user_id = u.id AND bs.rating IS NOT NULL) AS avg_rating
       FROM users u
       LEFT JOIN lead_profiles lp ON lp.user_id = u.id
       ${where}
       ORDER BY COALESCE(lp.updated_at, u.created_at) DESC
       LIMIT 500`,
    ...args,
  );
}

const asLead = (row) => ({
  user: {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    city: row.city,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    createdAt: row.created_at,
  },
  primaryInterest: row.primary_interest,
  needType: row.need_type,
  childAgeMonths: row.child_age_months,
  mobilityNeed: row.mobility_need,
  buyingIntent: row.buying_intent,
  followupStatus: row.followup_status ?? 'new',
  ownerStaffId: row.owner_staff_id,
  notes: row.notes,
  sessionCount: row.session_count,
  lastSessionAt: row.last_session_at,
  avgRating: row.avg_rating == null ? null : Math.round(row.avg_rating * 10) / 10,
  updatedAt: row.profile_updated_at,
});

staffRouter.get('/leads', (req, res) => {
  res.json({ leads: leadRows(req).map(asLead) });
});

staffRouter.get('/leads.csv', (req, res) => {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = [
    'name', 'phone', 'email', 'city', 'interest', 'need', 'child_age_months', 'mobility_need',
    'buying_intent', 'followup_status', 'sessions', 'last_session_at', 'avg_rating',
    'whatsapp_opt_in', 'notes',
  ];
  const lines = [header.join(',')];
  for (const row of leadRows(req)) {
    const lead = asLead(row);
    lines.push(
      [
        lead.user.name, lead.user.phone, lead.user.email, lead.user.city, lead.primaryInterest,
        lead.needType, lead.childAgeMonths, lead.mobilityNeed, lead.buyingIntent,
        lead.followupStatus, lead.sessionCount, lead.lastSessionAt, lead.avgRating,
        lead.user.whatsappOptIn ? 'yes' : 'no', lead.notes,
      ].map(escape).join(','),
    );
  }
  track('leads_exported', { storeId: req.staff.store_id, payload: { staffId: req.staff.id } });
  res
    .type('text/csv')
    .set('Content-Disposition', `attachment; filename="frido-leads-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(lines.join('\n'));
});

staffRouter.patch('/leads/:userId', (req, res) => {
  const body = parse(
    z.object({
      followupStatus: z.enum(['new', 'contacted', 'demo_booked', 'won', 'lost']).optional(),
      notes: z.string().max(1000).nullable().optional(),
      claim: z.boolean().optional(),
    }),
    req.body,
  );
  const existing = get('SELECT * FROM lead_profiles WHERE user_id = ?', req.params.userId);
  if (!existing) throw notFound('unknown_lead', 'No such lead.');

  run(
    `UPDATE lead_profiles
        SET followup_status = COALESCE(?, followup_status),
            notes = ?,
            owner_staff_id = ?,
            updated_at = ?
      WHERE user_id = ?`,
    body.followupStatus ?? null,
    body.notes === undefined ? existing.notes : body.notes,
    body.claim ? req.staff.id : existing.owner_staff_id,
    nowIso(),
    req.params.userId,
  );

  track('lead_updated', {
    userId: req.params.userId,
    payload: { ...body, staffId: req.staff.id },
  });
  res.json({
    profile: view.leadProfile(get('SELECT * FROM lead_profiles WHERE user_id = ?', req.params.userId)),
  });
});

/* -------------------------------------------------------------------------- offers */

staffRouter.post('/offers/:code/redeem', (req, res) => {
  const offerRow = get('SELECT * FROM offers WHERE code = ?', req.params.code.toUpperCase());
  if (!offerRow) throw notFound('unknown_offer', 'No such code.');
  if (offerRow.redeemed_at) throw conflict('already_redeemed', 'This code was already used.');
  if (new Date(offerRow.expires_at).getTime() < Date.now()) {
    throw conflict('offer_expired', 'This code has expired.');
  }
  run('UPDATE offers SET redeemed_at = ? WHERE id = ?', nowIso(), offerRow.id);
  run(
    `UPDATE lead_profiles SET followup_status = 'won', updated_at = ? WHERE user_id = ?`,
    nowIso(),
    offerRow.user_id,
  );
  track('offer_redeemed', {
    userId: offerRow.user_id,
    sessionId: offerRow.session_id,
    storeId: req.staff.store_id,
    payload: { code: offerRow.code, staffId: req.staff.id },
  });
  res.json({ offer: view.offer(get('SELECT * FROM offers WHERE id = ?', offerRow.id)) });
});

/* ----------------------------------------------------------------------- analytics */

staffRouter.get('/analytics', (req, res) => {
  const storeId = scopeStoreId(req);
  const days = Math.min(Number.parseInt(req.query.days ?? '30', 10) || 30, 120);
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();

  const countEvents = (type) =>
    get(
      `SELECT COUNT(*) AS count FROM events
        WHERE type = ? AND at >= ? ${storeId ? 'AND store_id = ?' : ''}`,
      type,
      since,
      ...(storeId ? [storeId] : []),
    ).count;

  // Yulu's funnel, renamed for a mall floor.
  const funnel = [
    { key: 'scans', label: 'QR scanned', value: countEvents('scan') + countEvents('store_scan') },
    { key: 'otp', label: 'Number entered', value: countEvents('otp_requested') },
    { key: 'leads', label: 'Verified + new lead', value: countEvents('lead_created') },
    { key: 'profiles', label: 'Profile completed', value: countEvents('profile_completed') },
    { key: 'started', label: 'Unit handed over', value: countEvents('session_started') },
    { key: 'completed', label: 'Returned', value: countEvents('session_completed') },
    { key: 'redeemed', label: 'Offer redeemed', value: countEvents('offer_redeemed') },
  ];

  const daily = all(
    `SELECT date(created_at) AS day,
            COUNT(*) AS sessions,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM borrow_sessions
      WHERE created_at >= ? ${storeId ? 'AND store_id = ?' : ''}
      GROUP BY day ORDER BY day`,
    since,
    ...(storeId ? [storeId] : []),
  );

  const byStore = all(
    `SELECT st.id, st.name, m.name AS mall_name, m.city,
            COUNT(bs.id) AS sessions,
            COUNT(DISTINCT bs.user_id) AS guests,
            AVG(bs.rating) AS avg_rating,
            (SELECT COUNT(*) FROM units un WHERE un.store_id = st.id) AS unit_count
       FROM stores st
       JOIN malls m ON m.id = st.mall_id
       LEFT JOIN borrow_sessions bs ON bs.store_id = st.id AND bs.created_at >= ?
      ${storeId ? 'WHERE st.id = ?' : ''}
      GROUP BY st.id ORDER BY sessions DESC`,
    since,
    ...(storeId ? [storeId] : []),
  ).map((row) => ({
    storeId: row.id,
    storeName: row.name,
    mallName: row.mall_name,
    city: row.city,
    sessions: row.sessions,
    guests: row.guests,
    unitCount: row.unit_count,
    avgRating: row.avg_rating == null ? null : Math.round(row.avg_rating * 10) / 10,
    sessionsPerUnit: row.unit_count ? Math.round((row.sessions / row.unit_count) * 10) / 10 : 0,
  }));

  const byProduct = all(
    `SELECT p.name, p.category, COUNT(bs.id) AS sessions, AVG(bs.rating) AS avg_rating
       FROM products p
       LEFT JOIN units un ON un.product_id = p.id
       LEFT JOIN borrow_sessions bs ON bs.unit_id = un.id AND bs.created_at >= ?
                                    ${storeId ? 'AND bs.store_id = ?' : ''}
      GROUP BY p.id ORDER BY sessions DESC`,
    since,
    ...(storeId ? [storeId] : []),
  ).map((row) => ({
    name: row.name,
    category: row.category,
    sessions: row.sessions,
    avgRating: row.avg_rating == null ? null : Math.round(row.avg_rating * 10) / 10,
  }));

  const intent = all(
    `SELECT COALESCE(buying_intent, 'unknown') AS intent, COUNT(*) AS count
       FROM lead_profiles GROUP BY intent`,
  );
  const pipeline = all(
    `SELECT followup_status AS status, COUNT(*) AS count FROM lead_profiles GROUP BY status`,
  );

  const durations = get(
    `SELECT AVG((julianday(ended_at) - julianday(started_at)) * 24 * 60) AS avg_minutes
       FROM borrow_sessions
      WHERE status = 'completed' AND started_at IS NOT NULL AND created_at >= ?
        ${storeId ? 'AND store_id = ?' : ''}`,
    since,
    ...(storeId ? [storeId] : []),
  );

  res.json({
    windowDays: days,
    funnel,
    daily,
    byStore,
    byProduct,
    intent,
    pipeline,
    avgSessionMinutes: durations?.avg_minutes ? Math.round(durations.avg_minutes) : null,
  });
});

staffRouter.get('/stores', (req, res) => {
  const rows =
    req.staff.role === 'admin'
      ? all('SELECT * FROM stores WHERE is_active = 1 ORDER BY name')
      : all('SELECT * FROM stores WHERE id = ?', req.staff.store_id);
  res.json({ stores: rows.map((row) => view.store(row)) });
});
