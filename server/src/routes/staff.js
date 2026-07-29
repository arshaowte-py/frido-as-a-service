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
  minutesBetween,
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

staffRouter.post('/login', async (req, res) => {
  const body = parse(z.object({ phone: z.string(), pin: z.string() }), req.body);
  const member = await get(
    'SELECT * FROM staff WHERE phone = ? AND is_active = 1',
    normalisePhone(body.phone),
  );
  if (!member || !timingSafeEqual(member.pin, body.pin)) {
    throw badRequest('bad_credentials', 'That phone and PIN combination did not work.');
  }
  await track('staff_login', { storeId: member.store_id, payload: { staffId: member.id } });
  res.json({
    token: issueToken({ sub: member.id }, { audience: 'staff', ttlSeconds: 60 * 60 * 10 }),
    staff: await view.staffMember(member),
  });
});

// Printable sticker for the physical unit. An <img> tag cannot send an Authorization
// header, so this one route also accepts the staff token as a query parameter. It is
// declared before the blanket requireStaff below.
staffRouter.get(
  '/units/:id/qr.svg',
  (req, res, next) => {
    if (req.query.t && !req.get('authorization')) req.headers.authorization = `Bearer ${req.query.t}`;
    requireStaff(req, res, next);
  },
  async (req, res) => {
    const unitRow = await get('SELECT * FROM units WHERE id = ?', req.params.id);
    if (!unitRow) throw notFound('unknown_unit', 'No such unit.');
    const svg = await QRCode.toString(`${config.publicBaseUrl}/s/${unitRow.qr_token}`, {
      type: 'svg',
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
    });
    res.type('image/svg+xml').set('Cache-Control', 'private, max-age=3600').send(svg);
  },
);

staffRouter.use(requireStaff);

staffRouter.get('/me', async (req, res) => res.json({ staff: await view.staffMember(req.staff) }));

// Admins see the whole estate; everyone else is scoped to their own store.
const scopeStoreId = (req) =>
  req.staff.role === 'admin' ? (req.query.storeId ?? null) : req.staff.store_id;

/* ---------------------------------------------------------------------- live board */

staffRouter.get('/overview', async (req, res) => {
  const storeId = scopeStoreId(req);
  const scope = storeId ? 'AND s.store_id = ?' : '';
  const args = storeId ? [storeId] : [];

  const liveRows = await all(
    `SELECT s.* FROM borrow_sessions s
      WHERE s.status IN ('pending', 'active') ${scope}
      ORDER BY s.due_at IS NULL, s.due_at`,
    ...args,
  );

  const live = await Promise.all(
    liveRows.map(async (row) => ({
      ...(await view.borrowSession(row)),
      guest: view.user(await get('SELECT * FROM users WHERE id = ?', row.user_id)),
    })),
  );

  const fleetRows = await all(
    `SELECT status, CAST(COUNT(*) AS INTEGER) AS count FROM units
      WHERE 1 = 1 ${storeId ? 'AND store_id = ?' : ''}
      GROUP BY status`,
    ...args,
  );
  const fleet = fleetRows.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count) }), {});

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = await get(
    `SELECT
       CAST(COUNT(*) AS INTEGER) AS sessions,
       CAST(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS INTEGER) AS completed
     FROM borrow_sessions s
     WHERE substr(s.created_at, 1, 10) = ? ${scope}`,
    today,
    ...args,
  );

  const newLeadsToday = await get(
    `SELECT CAST(COUNT(DISTINCT u.id) AS INTEGER) AS count
       FROM users u
       JOIN borrow_sessions s ON s.user_id = u.id
      WHERE substr(u.created_at, 1, 10) = ? ${scope}`,
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
      sessions: Number(todayStats?.sessions ?? 0),
      completed: Number(todayStats?.completed ?? 0),
      newLeads: Number(newLeadsToday?.count ?? 0),
    },
  });
});

/* --------------------------------------------------------------------------- fleet */

staffRouter.get('/units', async (req, res) => {
  const storeId = scopeStoreId(req);
  const rows = await all(
    `SELECT * FROM units ${storeId ? 'WHERE store_id = ?' : ''} ORDER BY code`,
    ...(storeId ? [storeId] : []),
  );

  const units = await Promise.all(
    rows.map(async (row) => {
      const live = await get(
        `SELECT * FROM borrow_sessions WHERE unit_id = ? AND status IN ('pending','active')`,
        row.id,
      );
      return {
        ...(await view.unit(row, { includeToken: true })),
        store: await view.store(await get('SELECT * FROM stores WHERE id = ?', row.store_id)),
        currentSession: live
          ? {
              ...(await view.borrowSession(live)),
              guest: view.user(await get('SELECT * FROM users WHERE id = ?', live.user_id)),
            }
          : null,
      };
    }),
  );
  res.json({ units });
});

staffRouter.patch('/units/:id', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(['available', 'maintenance', 'retired']).optional(),
      conditionNote: z.string().max(200).nullable().optional(),
    }),
    req.body,
  );
  const unitRow = await get('SELECT * FROM units WHERE id = ?', req.params.id);
  if (!unitRow) throw notFound('unknown_unit', 'No such unit.');
  if (body.status && ['reserved', 'in_use'].includes(unitRow.status)) {
    throw conflict('unit_busy', 'Close the running session before changing this unit.');
  }
  await run(
    'UPDATE units SET status = COALESCE(?, status), condition_note = ?, last_serviced_at = ? WHERE id = ?',
    body.status ?? null,
    body.conditionNote === undefined ? unitRow.condition_note : body.conditionNote,
    body.status === 'available' ? nowIso() : unitRow.last_serviced_at,
    unitRow.id,
  );
  await track('unit_updated', {
    unitId: unitRow.id,
    storeId: unitRow.store_id,
    payload: { ...body, staffId: req.staff.id },
  });
  res.json({
    unit: await view.unit(await get('SELECT * FROM units WHERE id = ?', unitRow.id), {
      includeToken: true,
    }),
  });
});

staffRouter.post('/units', requireRole('store_lead', 'admin'), async (req, res) => {
  const body = parse(
    z.object({
      productId: z.string(),
      storeId: z.string().optional(),
      count: z.number().int().min(1).max(20).default(1),
    }),
    req.body,
  );
  const storeId = body.storeId ?? req.staff.store_id;
  const storeRow = await get('SELECT * FROM stores WHERE id = ?', storeId);
  const productRow = await get('SELECT * FROM products WHERE id = ?', body.productId);
  if (!storeRow || !productRow) throw notFound('unknown_target', 'Unknown store or product.');

  const prefix = productRow.unit_prefix ?? 'UNT';
  const created = [];
  for (let i = 0; i < body.count; i += 1) {
    const seqRow = await get(
      'SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units WHERE store_id = ? AND product_id = ?',
      storeId,
      productRow.id,
    );
    const unitId = id();
    await run(
      `INSERT INTO units (id, code, qr_token, product_id, store_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'available', ?)`,
      unitId,
      `FRD-${storeRow.code}-${prefix}-${String(Number(seqRow.count) + 1 + i).padStart(3, '0')}`,
      `u_${humanCode(10).toLowerCase()}`,
      productRow.id,
      storeId,
      nowIso(),
    );
    created.push(
      await view.unit(await get('SELECT * FROM units WHERE id = ?', unitId), {
        includeToken: true,
      }),
    );
  }
  res.status(201).json({ units: created });
});

/* ---------------------------------------------------------------- session handling */

staffRouter.post('/sessions/:id/handover', async (req, res) => {
  const body = parse(z.object({ unlockCode: z.string() }), req.body);
  const sessionRow = await get('SELECT * FROM borrow_sessions WHERE id = ?', req.params.id);
  if (!sessionRow) throw notFound('unknown_session', 'No such booking.');
  if (!timingSafeEqual(sessionRow.unlock_code, body.unlockCode.trim().toUpperCase())) {
    throw badRequest('bad_unlock_code', 'That code does not match this booking.');
  }
  const updated = await startSession(sessionRow, { by: `staff:${req.staff.id}` });
  res.json({ session: await view.borrowSession(updated) });
});

staffRouter.post('/sessions/:id/receive', async (req, res) => {
  const body = parse(
    z.object({ condition: z.enum(['good', 'damaged']).default('good') }),
    req.body ?? {},
  );
  const sessionRow = await get('SELECT * FROM borrow_sessions WHERE id = ?', req.params.id);
  if (!sessionRow) throw notFound('unknown_session', 'No such booking.');
  const result = await completeSession(sessionRow, {
    by: `staff:${req.staff.id}`,
    condition: body.condition,
  });
  res.json({
    session: await view.borrowSession(result.session),
    offer: await view.offer(result.offer),
  });
});

/* --------------------------------------------------------------------------- leads */

async function leadRows(req) {
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
    clauses.push("(lower(COALESCE(u.name, '')) LIKE ? OR u.phone LIKE ?)");
    args.push(search, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return all(
    `SELECT u.*, lp.primary_interest, lp.need_type, lp.child_age_months, lp.mobility_need,
            lp.buying_intent, lp.followup_status, lp.owner_staff_id, lp.notes,
            lp.updated_at AS profile_updated_at,
            (SELECT CAST(COUNT(*) AS INTEGER) FROM borrow_sessions bs WHERE bs.user_id = u.id) AS session_count,
            (SELECT MAX(bs.created_at) FROM borrow_sessions bs WHERE bs.user_id = u.id) AS last_session_at,
            (SELECT CAST(AVG(bs.rating) AS REAL) FROM borrow_sessions bs
              WHERE bs.user_id = u.id AND bs.rating IS NOT NULL) AS avg_rating
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
  sessionCount: Number(row.session_count ?? 0),
  lastSessionAt: row.last_session_at,
  avgRating: row.avg_rating == null ? null : Math.round(Number(row.avg_rating) * 10) / 10,
  updatedAt: row.profile_updated_at,
});

staffRouter.get('/leads', async (req, res) => {
  res.json({ leads: (await leadRows(req)).map(asLead) });
});

staffRouter.get('/leads.csv', async (req, res) => {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = [
    'name', 'phone', 'email', 'city', 'interest', 'need', 'child_age_months', 'mobility_need',
    'buying_intent', 'followup_status', 'sessions', 'last_session_at', 'avg_rating',
    'whatsapp_opt_in', 'notes',
  ];
  const lines = [header.join(',')];
  for (const row of await leadRows(req)) {
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
  await track('leads_exported', { storeId: req.staff.store_id, payload: { staffId: req.staff.id } });
  res
    .type('text/csv')
    .set(
      'Content-Disposition',
      `attachment; filename="frido-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    .send(lines.join('\n'));
});

staffRouter.patch('/leads/:userId', async (req, res) => {
  const body = parse(
    z.object({
      followupStatus: z.enum(['new', 'contacted', 'demo_booked', 'won', 'lost']).optional(),
      notes: z.string().max(1000).nullable().optional(),
      claim: z.boolean().optional(),
    }),
    req.body,
  );
  const existing = await get('SELECT * FROM lead_profiles WHERE user_id = ?', req.params.userId);
  if (!existing) throw notFound('unknown_lead', 'No such lead.');

  await run(
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

  await track('lead_updated', {
    userId: req.params.userId,
    payload: { ...body, staffId: req.staff.id },
  });
  res.json({
    profile: view.leadProfile(
      await get('SELECT * FROM lead_profiles WHERE user_id = ?', req.params.userId),
    ),
  });
});

/* -------------------------------------------------------------------------- offers */

staffRouter.post('/offers/:code/redeem', async (req, res) => {
  const offerRow = await get('SELECT * FROM offers WHERE code = ?', req.params.code.toUpperCase());
  if (!offerRow) throw notFound('unknown_offer', 'No such code.');
  if (offerRow.redeemed_at) throw conflict('already_redeemed', 'This code was already used.');
  if (new Date(offerRow.expires_at).getTime() < Date.now()) {
    throw conflict('offer_expired', 'This code has expired.');
  }
  await run('UPDATE offers SET redeemed_at = ? WHERE id = ?', nowIso(), offerRow.id);
  await run(
    `UPDATE lead_profiles SET followup_status = 'won', updated_at = ? WHERE user_id = ?`,
    nowIso(),
    offerRow.user_id,
  );
  await track('offer_redeemed', {
    userId: offerRow.user_id,
    sessionId: offerRow.session_id,
    storeId: req.staff.store_id,
    payload: { code: offerRow.code, staffId: req.staff.id },
  });
  res.json({ offer: await view.offer(await get('SELECT * FROM offers WHERE id = ?', offerRow.id)) });
});

/* ----------------------------------------------------------------------- analytics */

staffRouter.get('/analytics', async (req, res) => {
  const storeId = scopeStoreId(req);
  const days = Math.min(Number.parseInt(req.query.days ?? '30', 10) || 30, 120);
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  const scopeArgs = storeId ? [storeId] : [];

  const countEvents = async (type) => {
    const row = await get(
      `SELECT CAST(COUNT(*) AS INTEGER) AS count FROM events
        WHERE type = ? AND at >= ? ${storeId ? 'AND store_id = ?' : ''}`,
      type,
      since,
      ...scopeArgs,
    );
    return Number(row?.count ?? 0);
  };

  // Yulu's funnel, renamed for a mall floor.
  const funnel = [
    {
      key: 'scans',
      label: 'QR scanned',
      value: (await countEvents('scan')) + (await countEvents('store_scan')),
    },
    { key: 'otp', label: 'Number entered', value: await countEvents('otp_requested') },
    { key: 'leads', label: 'Verified + new lead', value: await countEvents('lead_created') },
    { key: 'profiles', label: 'Profile completed', value: await countEvents('profile_completed') },
    { key: 'started', label: 'Unit handed over', value: await countEvents('session_started') },
    { key: 'completed', label: 'Returned', value: await countEvents('session_completed') },
    { key: 'redeemed', label: 'Offer redeemed', value: await countEvents('offer_redeemed') },
  ];

  const daily = (
    await all(
      `SELECT substr(created_at, 1, 10) AS day,
              CAST(COUNT(*) AS INTEGER) AS sessions,
              CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS INTEGER) AS completed
         FROM borrow_sessions
        WHERE created_at >= ? ${storeId ? 'AND store_id = ?' : ''}
        GROUP BY substr(created_at, 1, 10) ORDER BY day`,
      since,
      ...scopeArgs,
    )
  ).map((row) => ({
    day: row.day,
    sessions: Number(row.sessions),
    completed: Number(row.completed ?? 0),
  }));

  const byStore = (
    await all(
      `SELECT st.id, st.name, m.name AS mall_name, m.city,
              CAST(COUNT(bs.id) AS INTEGER) AS sessions,
              CAST(COUNT(DISTINCT bs.user_id) AS INTEGER) AS guests,
              CAST(AVG(bs.rating) AS REAL) AS avg_rating,
              (SELECT CAST(COUNT(*) AS INTEGER) FROM units un WHERE un.store_id = st.id) AS unit_count
         FROM stores st
         JOIN malls m ON m.id = st.mall_id
         LEFT JOIN borrow_sessions bs ON bs.store_id = st.id AND bs.created_at >= ?
        ${storeId ? 'WHERE st.id = ?' : ''}
        GROUP BY st.id, st.name, m.name, m.city ORDER BY sessions DESC`,
      since,
      ...scopeArgs,
    )
  ).map((row) => {
    const sessions = Number(row.sessions);
    const unitCount = Number(row.unit_count);
    return {
      storeId: row.id,
      storeName: row.name,
      mallName: row.mall_name,
      city: row.city,
      sessions,
      guests: Number(row.guests),
      unitCount,
      avgRating: row.avg_rating == null ? null : Math.round(Number(row.avg_rating) * 10) / 10,
      sessionsPerUnit: unitCount ? Math.round((sessions / unitCount) * 10) / 10 : 0,
    };
  });

  const byProduct = (
    await all(
      `SELECT p.id, p.name, p.category,
              CAST(COUNT(bs.id) AS INTEGER) AS sessions,
              CAST(AVG(bs.rating) AS REAL) AS avg_rating
         FROM products p
         LEFT JOIN units un ON un.product_id = p.id
         LEFT JOIN borrow_sessions bs ON bs.unit_id = un.id AND bs.created_at >= ?
                                      ${storeId ? 'AND bs.store_id = ?' : ''}
        GROUP BY p.id, p.name, p.category ORDER BY sessions DESC`,
      since,
      ...scopeArgs,
    )
  ).map((row) => ({
    name: row.name,
    category: row.category,
    sessions: Number(row.sessions),
    avgRating: row.avg_rating == null ? null : Math.round(Number(row.avg_rating) * 10) / 10,
  }));

  const intent = (
    await all(
      `SELECT COALESCE(buying_intent, 'unknown') AS intent, CAST(COUNT(*) AS INTEGER) AS count
         FROM lead_profiles GROUP BY COALESCE(buying_intent, 'unknown')`,
    )
  ).map((row) => ({ intent: row.intent, count: Number(row.count) }));

  const pipeline = (
    await all(
      `SELECT followup_status AS status, CAST(COUNT(*) AS INTEGER) AS count
         FROM lead_profiles GROUP BY followup_status`,
    )
  ).map((row) => ({ status: row.status, count: Number(row.count) }));

  // Averaged in JS rather than SQL — SQLite and Postgres disagree on date arithmetic,
  // and the completed-session count here is small.
  const completed = await all(
    `SELECT started_at, ended_at FROM borrow_sessions
      WHERE status = 'completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL
        AND created_at >= ? ${storeId ? 'AND store_id = ?' : ''}`,
    since,
    ...scopeArgs,
  );
  const avgSessionMinutes = completed.length
    ? Math.round(
        completed.reduce((total, row) => total + minutesBetween(row.started_at, row.ended_at), 0) /
          completed.length,
      )
    : null;

  res.json({
    windowDays: days,
    funnel,
    daily,
    byStore,
    byProduct,
    intent,
    pipeline,
    avgSessionMinutes,
  });
});

staffRouter.get('/stores', async (req, res) => {
  const rows =
    req.staff.role === 'admin'
      ? await all('SELECT * FROM stores WHERE is_active = 1 ORDER BY name')
      : await all('SELECT * FROM stores WHERE id = ?', req.staff.store_id);
  res.json({ stores: await view.many(rows, view.store) });
});
