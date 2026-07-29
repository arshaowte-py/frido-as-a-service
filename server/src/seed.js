/**
 * Seeds a demo estate: 12 mall stores, a fleet of units, staff logins, and ~30 days of
 * synthetic guest activity so the staff console has something to show on first run.
 *
 * Run with `npm run seed` (no-ops if data exists) or `npm run reset` (wipes first).
 * The same function backs POST /api/admin/seed, which is how the hosted demo is filled.
 *
 * Rows are accumulated in memory and written with batched multi-row INSERTs — against a
 * network database, one statement per row takes minutes.
 *
 * ⚠️ PRODUCT PRICING BELOW IS A PLACEHOLDER. The live myfrido.com pages block automated
 * fetches, so MRP / selling price / feature copy were filled in by hand and must be
 * checked against the PDPs before this is shown to anyone outside the team.
 */
import { bulkInsert, exec, get, migrate, run, transaction } from './db.js';
import { addMinutes, humanCode, id, nowIso } from './util.js';

// Deterministic PRNG so a reseed produces the same demo estate.
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  {
    id: 'prod_autofold_stroller',
    slug: 'frido-autofold-travel-stroller',
    category: 'stroller',
    unit_prefix: 'STR',
    name: 'Frido Autofold Travel Stroller',
    tagline: 'One-hand autofold. Cabin-friendly. Built for long mall days.',
    product_url: 'https://myfrido.com/products/frido-autofold-travel-stroller',
    image_url: '/images/stroller.svg',
    fleet_per_store: 3,
    mrp_paise: 2499900,
    price_paise: 1699900,
    features: [
      'One-hand automatic fold, stands on its own',
      'Vegan-leather handle, large UV-block canopy',
      'Reclining seat with a 5-point harness',
      'Shock-absorbing wheels for mall flooring',
      'Suits roughly 6 months to 3 years',
    ],
    deposit_note: 'Any photo ID held at the counter, returned when you bring the stroller back.',
  },
  {
    id: 'prod_prime_wheelchair',
    slug: 'frido-prime-electric-wheelchair-el-fnn02',
    category: 'wheelchair',
    unit_prefix: 'PRM',
    name: 'Frido Prime Electric Wheelchair',
    tagline: 'Motorised independence. Joystick control, folds into a boot.',
    product_url: 'https://mobility.myfrido.com/products/frido-prime-electric-wheelchair-el-fnn02',
    image_url: '/images/wheelchair.svg',
    fleet_per_store: 2,
    mrp_paise: 14999900,
    price_paise: 10999900,
    features: [
      'Dual brushless motors, joystick control',
      'Folds down for car boots and cabs',
      'Lightweight — easy for one person to lift',
      'Anti-tip wheels and electromagnetic brakes',
      'Comfortable for a full day out',
    ],
    deposit_note:
      'Any photo ID held at the counter. A staff member walks you through the controls first.',
  },
  {
    id: 'prod_heavy_duty_recliner',
    slug: 'frido-heavy-duty-recliner-wheelchair',
    category: 'wheelchair',
    unit_prefix: 'HDR',
    name: 'Frido Heavy Duty Recliner Wheelchair',
    tagline: 'Full-recline comfort with elevating leg rests, for longer visits.',
    product_url: 'https://mobility.myfrido.com/products/frido-heavy-duty-recliner-wheelchair',
    image_url: null, // uses the in-app illustration until a PDP photo is dropped in
    fleet_per_store: 1,
    mrp_paise: 3499900,
    price_paise: 2599900,
    features: [
      'Reclining backrest with a padded headrest',
      'Elevating, cushioned leg rests',
      'High weight capacity for heavier users',
      'Joystick control with attendant override',
      'Extra padding for long sittings',
    ],
    deposit_note:
      'Any photo ID held at the counter. Best for guests who need recline or leg support.',
  },
];

// The 13 live Frido mall stores.
// [mallId, mallName, city, address, storeId, storeCode, floor, unitNo, lat, lng]
// ⚠️ Coordinates are approximate mall pins — replace with the exact store location from
// Google Business before geofenced features (return nudges, "nearest store") go live.
const MALLS = [
  ['mall_pmc_viman', 'Phoenix Marketcity', 'Pune', 'Viman Nagar, Pune', 'st_pmc_viman', 'PMCP', 'Level 1', 'F1-22', 18.5619, 73.9169],
  ['mall_amanora', 'Amanora Mall', 'Pune', 'Magarpatta, Pune', 'st_amanora', 'AMNP', 'Level 1', 'F1-40', 18.5169, 73.9339],
  ['mall_elpro', 'Elpro City Square', 'Pune', 'PCMC, Pune', 'st_elpro', 'ELPP', 'Ground', 'G-14', 18.6298, 73.8009],
  ['mall_nexus_westend', 'Nexus Westend', 'Pune', 'Aundh, Pune', 'st_nexus_westend', 'NXWP', 'Level 2', 'L2-06', 18.5626, 73.8100],
  ['mall_kopa', 'Kopa Mall', 'Pune', 'Ghorpadi, Koregaon Park, Pune', 'st_kopa', 'KOPP', 'Ground', 'G-03', 18.5389, 73.8969],
  ['mall_moa_blr', 'Phoenix Mall of Asia', 'Bengaluru', 'Hebbal, Bengaluru', 'st_moa_blr', 'MOAB', 'Level 1', 'F1-11', 13.0470, 77.5960],
  ['mall_lakeshore_hyd', 'Lakeshore', 'Hyderabad', 'Y Junction, Hyderabad', 'st_lakeshore', 'LAKH', 'Level 1', 'F1-09', 17.4620, 78.3660],
  ['mall_skycity', 'Sky City Mall', 'Mumbai', 'Borivali, Mumbai', 'st_skycity', 'SKYM', 'Level 2', 'L2-18', 19.2288, 72.8570],
  ['mall_dlf_summit', 'DLF Summit', 'Gurugram', 'DLF, Gurugram', 'st_dlf_summit', 'DLFG', 'Ground', 'G-21', 28.4949, 77.0880],
  ['mall_bhartiya', 'Bhartiya Mall', 'Bengaluru', 'Thanisandra, Bengaluru', 'st_bhartiya', 'BHRB', 'Level 1', 'F1-15', 13.0700, 77.6300],
  ['mall_vegas', 'Vegas Mall', 'Delhi', 'Dwarka, New Delhi', 'st_vegas', 'VEGD', 'Level 1', 'F1-30', 28.5920, 77.0460],
  ['mall_lulu_blr', 'Lulu Mall', 'Bengaluru', 'Rajajinagar, Bengaluru', 'st_lulu_blr', 'LULB', 'Ground', 'G-40', 13.0060, 77.5560],
  ['mall_pmc_whitefield', 'Phoenix Marketcity', 'Bengaluru', 'Whitefield, Bengaluru', 'st_pmc_whitefield', 'PMCW', 'Level 2', 'L2-25', 12.9960, 77.6970],
];

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Ishita', 'Kabir', 'Meera', 'Vikram', 'Sneha', 'Arjun', 'Priya',
  'Nikhil', 'Divya', 'Rahul', 'Kavya', 'Siddharth', 'Nandini', 'Aditya', 'Pooja', 'Manish',
  'Shruti', 'Karan', 'Neha', 'Varun', 'Ritika', 'Sameer', 'Anjali', 'Harsh', 'Tanvi', 'Gaurav',
  'Lakshmi', 'Imran', 'Fatima', 'Joseph', 'Reema',
];
const LAST_NAMES = [
  'Sharma', 'Iyer', 'Nair', 'Patel', 'Reddy', 'Gupta', 'Menon', 'Joshi', 'Verma', 'Kulkarni',
  'Desai', 'Banerjee', 'Chopra', 'Rao', 'Mehta', 'Pillai', 'Shetty', 'Khan', 'Fernandes', 'Bose',
];

const STROLLER_PURPOSES = [
  'Toddler got tired', 'Long shopping trip', 'Weekend family outing', 'Movie + dinner',
  'Kid fell asleep', 'Birthday party at the mall',
];
const WHEELCHAIR_PURPOSES = [
  'Elderly parent visiting', 'Post-surgery recovery', 'Knee pain, long walk',
  'Mobility support for the day', 'Grandmother joining us', 'Fracture, on rest',
];
const NEED_TYPES_STROLLER = ['toddler', 'infant', 'twins', 'special_needs_child'];
const MOBILITY_NEEDS = [
  'elderly_parent', 'post_surgery', 'chronic_pain', 'permanent_mobility_aid', 'injury_recovery',
];
const INTENTS = ['just_borrowing', 'curious', 'considering', 'ready_to_buy'];
const FOLLOWUPS = ['new', 'new', 'new', 'contacted', 'contacted', 'demo_booked', 'won', 'lost'];

const TABLES_IN_DEPENDENCY_ORDER = [
  'events', 'offers', 'borrow_sessions', 'lead_profiles', 'otp_challenges', 'users',
  'units', 'staff', 'stores', 'malls', 'products',
];

export async function wipe() {
  for (const table of TABLES_IN_DEPENDENCY_ORDER) await exec(`DELETE FROM ${table}`);
}

/**
 * @param {{ reset?: boolean, historyDays?: number, atomic?: boolean }} [options]
 *   atomic writes everything in one transaction, so two serverless instances racing to
 *   seed the same empty database cannot both half-succeed — units.code is UNIQUE, so the
 *   loser rolls back cleanly.
 * @returns {Promise<{ seeded: boolean, counts?: object, sampleQrToken?: string }>}
 */
export async function seedDatabase({ reset = false, historyDays = 30, atomic = false } = {}) {
  await migrate();
  if (reset) await wipe();

  const existing = await get('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM units');
  if (Number(existing?.count ?? 0) > 0) return { seeded: false };

  const rand = mulberry32(20260729);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const chance = (probability) => rand() < probability;

  const now = new Date();

  // --- accumulate ---------------------------------------------------------------
  const malls = [];
  const stores = [];
  const units = [];
  const staff = [];
  const users = [];
  const leads = [];
  const sessions = [];
  const offers = [];
  const events = [];

  const event = (type, at, f = {}) =>
    events.push([
      id(), at, type, f.userId ?? null, f.sessionId ?? null, f.unitId ?? null, f.storeId ?? null,
      f.payload ? JSON.stringify(f.payload) : null,
    ]);

  const products = PRODUCTS.map((p) => [
    p.id, p.slug, p.category, p.unit_prefix, p.name, p.tagline, p.product_url, p.image_url,
    p.mrp_paise, p.price_paise, JSON.stringify(p.features), p.deposit_note,
  ]);

  const storeIds = [];
  const unitsByStore = new Map();
  const cityByStore = new Map();

  MALLS.forEach(
    ([mallId, mallName, city, address, storeId, storeCode, floor, unitNo, lat, lng], index) => {
    malls.push([mallId, mallName, city, address, nowIso()]);
    stores.push([
      storeId, mallId, storeCode, `Frido ${mallName}`, floor, unitNo,
      `98${between(10000000, 99999999)}`, lat, lng, 150, nowIso(),
    ]);
    storeIds.push(storeId);
    cityByStore.set(storeId, city);
    unitsByStore.set(storeId, []);

    for (const product of PRODUCTS) {
      const prefix = product.unit_prefix;
      for (let i = 1; i <= product.fleet_per_store; i += 1) {
        const unitId = id();
        units.push([
          unitId,
          `FRD-${storeCode}-${prefix}-${String(i).padStart(3, '0')}`,
          `u_${storeCode.toLowerCase()}${prefix.toLowerCase()}${i}${humanCode(5).toLowerCase()}`,
          product.id, storeId, 'available', between(4, 90), nowIso(),
        ]);
        unitsByStore.get(storeId).push({ id: unitId, productId: product.id, category: product.category });
      }
    }

    staff.push([
      id(), `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      `90${String(index + 1).padStart(2, '0')}000000`, storeId, '1234', 'store_lead', 1, nowIso(),
    ]);
  });

  staff.push([id(), 'Frido Ops (HQ)', '9999999999', null, '4321', 'admin', 1, nowIso()]);

  // --- history ------------------------------------------------------------------
  const takenUnits = new Set();

  for (let dayOffset = historyDays; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60_000);
    const isWeekend = [0, 6].includes(day.getDay());
    const sessionsToday = isWeekend ? between(9, 16) : between(3, 8);

    // Scans that never turned into anything — the top of the funnel has to be wider.
    for (let i = 0; i < sessionsToday * 2; i += 1) {
      const storeId = pick(storeIds);
      const at = new Date(day).setHours(between(10, 21), between(0, 59), 0, 0);
      event('scan', new Date(at).toISOString(), { storeId });
      if (chance(0.55)) event('otp_requested', new Date(at + 40_000).toISOString(), { storeId });
    }

    for (let i = 0; i < sessionsToday; i += 1) {
      const storeId = pick(storeIds);
      const unitRow = pick(unitsByStore.get(storeId));
      const isStroller = unitRow.category === 'stroller';

      const createdAt = new Date(
        new Date(day).setHours(between(11, 20), between(0, 59), 0, 0),
      ).toISOString();

      const userId = id();
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      users.push([
        userId,
        `${pick(['6', '7', '8', '9'])}${between(100000000, 999999999)}`,
        name,
        chance(0.55) ? `${name.split(' ')[0].toLowerCase()}${between(10, 999)}@example.com` : null,
        cityByStore.get(storeId),
        chance(0.72) ? 1 : 0,
        createdAt, createdAt,
      ]);

      const intent = chance(0.25) ? pick(INTENTS.slice(2)) : pick(INTENTS.slice(0, 3));
      const redeemed = chance(0.11);
      leads.push([
        userId, unitRow.category,
        isStroller ? pick(NEED_TYPES_STROLLER) : 'mobility_support',
        isStroller ? between(4, 48) : null,
        isStroller ? null : pick(MOBILITY_NEEDS),
        intent,
        redeemed ? 'won' : pick(FOLLOWUPS),
        createdAt,
      ]);

      event('scan', createdAt, { storeId, unitId: unitRow.id, userId });
      event('otp_requested', addMinutes(createdAt, 1), { storeId, userId });
      event('lead_created', addMinutes(createdAt, 2), { storeId, userId });
      event('profile_completed', addMinutes(createdAt, 3), { storeId, userId });

      // A slice of guests reserve and then wander off without collecting.
      const abandoned = chance(0.08);
      const startedAt = addMinutes(createdAt, between(3, 9));
      const durationMinutes = between(35, 190);
      const endedAt = addMinutes(startedAt, durationMinutes);
      const extensions =
        durationMinutes > 120 ? Math.min(2, Math.ceil((durationMinutes - 120) / 60)) : 0;

      const sessionId = id();
      const ref = humanCode(6);
      sessions.push([
        sessionId, ref, userId, unitRow.id, storeId,
        abandoned ? 'cancelled' : 'completed',
        humanCode(4),
        isStroller ? pick(STROLLER_PURPOSES) : pick(WHEELCHAIR_PURPOSES),
        between(2, 5),
        'id_card',
        abandoned ? null : startedAt,
        abandoned ? null : addMinutes(startedAt, 120 + extensions * 60),
        abandoned ? addMinutes(createdAt, 30) : endedAt,
        abandoned ? 0 : extensions,
        abandoned ? null : chance(0.04) ? 'damaged' : 'good',
        abandoned ? null : chance(0.85) ? between(4, 5) : between(2, 3),
        null,
        createdAt,
      ]);

      event('session_reserved', createdAt, { storeId, userId, sessionId, unitId: unitRow.id });
      if (abandoned) {
        event('session_cancelled', addMinutes(createdAt, 30), { storeId, userId, sessionId });
        continue;
      }

      event('session_started', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
      for (let e = 0; e < extensions; e += 1) {
        event('session_extended', addMinutes(startedAt, 110 + e * 60), { storeId, userId, sessionId });
      }
      event('session_completed', endedAt, { storeId, userId, sessionId, unitId: unitRow.id });
      event('feedback_given', addMinutes(endedAt, 2), { storeId, userId, sessionId });

      const offerCode = `MALL${humanCode(4)}`;
      offers.push([
        id(), offerCode, userId, sessionId, unitRow.productId, 10,
        addMinutes(endedAt, 7 * 24 * 60),
        redeemed ? addMinutes(endedAt, between(20, 2000)) : null,
        endedAt,
      ]);
      event('offer_issued', endedAt, { storeId, userId, sessionId, payload: { code: offerCode } });
      if (redeemed) {
        event('offer_redeemed', addMinutes(endedAt, 30), {
          storeId, userId, sessionId, payload: { code: offerCode },
        });
      }
    }
  }

  // --- a handful of sessions running right now, for the live board -----------------
  for (let i = 0; i < 7; i += 1) {
    const storeId = pick(storeIds);
    const candidates = unitsByStore.get(storeId).filter((u) => !takenUnits.has(u.id));
    if (candidates.length === 0) continue;
    const unitRow = pick(candidates);
    takenUnits.add(unitRow.id);

    const isStroller = unitRow.category === 'stroller';
    const pending = i < 2;
    // One of the live sessions is deliberately past due so the overdue path is visible.
    const startedAt = addMinutes(nowIso(), -(i === 2 ? between(150, 200) : between(15, 100)));

    const userId = id();
    users.push([
      userId,
      `${pick(['6', '7', '8', '9'])}${between(100000000, 999999999)}`,
      `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      null, cityByStore.get(storeId), 1, startedAt, nowIso(),
    ]);
    leads.push([
      userId, unitRow.category,
      isStroller ? pick(NEED_TYPES_STROLLER) : 'mobility_support',
      isStroller ? between(4, 48) : null,
      isStroller ? null : pick(MOBILITY_NEEDS),
      pick(INTENTS), 'new', nowIso(),
    ]);

    const sessionId = id();
    sessions.push([
      sessionId, humanCode(6), userId, unitRow.id, storeId,
      pending ? 'pending' : 'active',
      humanCode(4),
      isStroller ? pick(STROLLER_PURPOSES) : pick(WHEELCHAIR_PURPOSES),
      between(2, 5), 'id_card',
      pending ? null : startedAt,
      pending ? null : addMinutes(startedAt, 120),
      null, 0, null, null, null,
      pending ? addMinutes(nowIso(), -between(2, 12)) : startedAt,
    ]);

    // Reflect the live session in the unit row that is about to be inserted.
    const unitTuple = units.find((row) => row[0] === unitRow.id);
    unitTuple[5] = pending ? 'reserved' : 'in_use';

    event('session_reserved', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
    if (!pending) {
      event('session_started', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
    }
  }

  // A couple of units off the floor for servicing, so the fleet view isn't all green.
  for (const row of units) {
    if (row[5] !== 'available') continue;
    if (!chance(0.04)) continue;
    row[5] = 'maintenance';
  }

  // --- write --------------------------------------------------------------------
  const writeAll = async (execute) => {
    await bulkInsert(
      'products',
      ['id', 'slug', 'category', 'unit_prefix', 'name', 'tagline', 'product_url', 'image_url',
        'mrp_paise', 'price_paise', 'features_json', 'deposit_note'],
      products, execute,
    );
    await bulkInsert('malls', ['id', 'name', 'city', 'address', 'created_at'], malls, execute);
    await bulkInsert(
      'stores',
      ['id', 'mall_id', 'code', 'name', 'floor', 'unit_no', 'phone', 'lat', 'lng',
        'geofence_radius_m', 'created_at'],
      stores, execute,
    );
    await bulkInsert(
      'units',
      ['id', 'code', 'qr_token', 'product_id', 'store_id', 'status', 'lifetime_sessions',
        'created_at'],
      units, execute,
    );
    await bulkInsert(
      'staff',
      ['id', 'name', 'phone', 'store_id', 'pin', 'role', 'is_active', 'created_at'],
      staff, execute,
    );
    await bulkInsert(
      'users',
      ['id', 'phone', 'name', 'email', 'city', 'whatsapp_opt_in', 'created_at', 'last_seen_at'],
      users, execute,
    );
    await bulkInsert(
      'lead_profiles',
      ['user_id', 'primary_interest', 'need_type', 'child_age_months', 'mobility_need',
        'buying_intent', 'followup_status', 'updated_at'],
      leads, execute,
    );
    await bulkInsert(
      'borrow_sessions',
      ['id', 'ref', 'user_id', 'unit_id', 'store_id', 'status', 'unlock_code', 'purpose',
        'party_size', 'deposit_type', 'started_at', 'due_at', 'ended_at', 'extensions',
        'return_condition', 'rating', 'feedback', 'created_at'],
      sessions, execute,
    );
    await bulkInsert(
      'offers',
      ['id', 'code', 'user_id', 'session_id', 'product_id', 'discount_pct', 'expires_at',
        'redeemed_at', 'created_at'],
      offers, execute,
    );
    await bulkInsert(
      'events',
      ['id', 'at', 'type', 'user_id', 'session_id', 'unit_id', 'store_id', 'payload_json'],
      events, execute,
    );
    await execute(
      `UPDATE units SET condition_note = 'Pulled for a service check' WHERE status = 'maintenance'`,
    );
  };

  if (atomic) {
    await transaction(async (tx) => writeAll((sql, ...params) => tx.run(sql, ...params)));
  } else {
    await writeAll(run);
  }

  const sample = await get(`SELECT code, qr_token FROM units WHERE status = 'available' LIMIT 1`);

  return {
    seeded: true,
    counts: {
      malls: malls.length,
      stores: stores.length,
      units: units.length,
      guests: users.length,
      sessions: sessions.length,
      staff: staff.length,
      events: events.length,
    },
    sampleQrToken: sample?.qr_token,
    sampleUnitCode: sample?.code,
  };
}

/* ------------------------------------------------------------------------ CLI */

const isCli = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isCli) {
  const result = await seedDatabase({ reset: process.argv.includes('--reset') });
  if (!result.seeded) {
    console.log('Database already seeded. Use `npm run reset` to rebuild it.');
  } else {
    console.log('\nSeeded Frido-as-a-Service demo estate:');
    for (const [key, value] of Object.entries(result.counts)) {
      console.log(`  ${key.padEnd(9)} ${value}`);
    }
    console.log(`\n  Try a scan:  /s/${result.sampleQrToken}   (unit ${result.sampleUnitCode})`);
    console.log('  Staff login: 9999999999 / 4321  (HQ admin, sees every store)');
    console.log('               9001000000 / 1234  (store lead, Phoenix Palladium Mumbai)\n');
  }
  process.exit(0);
}
