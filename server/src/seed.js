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
import { bulkInsert, exec, get, migrate, run } from './db.js';
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
    name: 'Frido Autofold Travel Stroller',
    tagline: 'One-hand autofold. Cabin-friendly. Built for long mall days.',
    product_url: 'https://myfrido.com/products/frido-autofold-travel-stroller',
    image_url: '/images/stroller.svg',
    mrp_paise: 2499900,
    price_paise: 1699900,
    features: [
      'One-hand automatic fold, stands on its own',
      'Suits roughly 6 months to 3 years',
      'Reclining seat with a 5-point harness',
      'Shock-absorbing wheels for mall flooring',
      'Under 8 kg — easy to lift into a car boot',
    ],
    deposit_note: 'Any photo ID held at the counter, returned when you bring the stroller back.',
  },
  {
    id: 'prod_prime_plus_wheelchair',
    slug: 'frido-prime-plus-electric-wheelchair',
    category: 'wheelchair',
    name: 'Frido Prime Plus Electric Wheelchair',
    tagline: 'Motorised independence. Joystick control, folds into a boot.',
    product_url: 'https://mobility.myfrido.com/products/frido-prime-plus-electric-wheelchair',
    image_url: '/images/wheelchair.svg',
    mrp_paise: 14999900,
    price_paise: 10999900,
    features: [
      'Dual brushless motors with joystick control',
      'Folds down for car boots and cabs',
      'Comfortable for a full day out',
      'Anti-tip wheels and electromagnetic brakes',
      'Supports up to 120 kg',
    ],
    deposit_note:
      'Any photo ID held at the counter. A staff member walks you through the controls first.',
  },
];

// [mallId, mallName, city, address, storeId, storeCode, floor, unitNo]
const MALLS = [
  ['mall_phoenix_palladium', 'Phoenix Palladium', 'Mumbai', 'Lower Parel, Mumbai', 'st_phx_mum', 'PHXM', 'Level 2', 'L2-14'],
  ['mall_phoenix_marketcity_pune', 'Phoenix Marketcity', 'Pune', 'Viman Nagar, Pune', 'st_phx_pun', 'PHXP', 'Level 1', 'F1-22'],
  ['mall_seasons', 'Seasons Mall', 'Pune', 'Magarpatta, Pune', 'st_sea_pun', 'SEAP', 'Ground', 'G-08'],
  ['mall_amanora', 'Amanora Mall', 'Pune', 'Hadapsar, Pune', 'st_ama_pun', 'AMAP', 'Level 1', 'F1-40'],
  ['mall_orion', 'Orion Mall', 'Bengaluru', 'Rajajinagar, Bengaluru', 'st_ori_blr', 'ORIB', 'Level 2', 'L2-31'],
  ['mall_phoenix_asia', 'Phoenix Mall of Asia', 'Bengaluru', 'Hebbal, Bengaluru', 'st_moa_blr', 'MOAB', 'Level 1', 'F1-11'],
  ['mall_ambience', 'Ambience Mall', 'Gurugram', 'NH-8, Gurugram', 'st_amb_ggn', 'AMBG', 'Ground', 'G-56'],
  ['mall_dlf_moi', 'DLF Mall of India', 'Noida', 'Sector 18, Noida', 'st_dlf_noi', 'DLFN', 'Level 3', 'L3-07'],
  ['mall_inorbit_hyd', 'Inorbit Mall', 'Hyderabad', 'Madhapur, Hyderabad', 'st_ino_hyd', 'INOH', 'Level 1', 'F1-18'],
  ['mall_lulu_kochi', 'Lulu Mall', 'Kochi', 'Edappally, Kochi', 'st_lul_koc', 'LULK', 'Ground', 'G-102'],
  ['mall_vr_chennai', 'VR Chennai', 'Chennai', 'Anna Nagar, Chennai', 'st_vrc_maa', 'VRCH', 'Level 2', 'L2-25'],
  ['mall_elante', 'Elante Mall', 'Chandigarh', 'Industrial Area Phase 1, Chandigarh', 'st_ela_chd', 'ELAC', 'Ground', 'G-19'],
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
 * @param {{ reset?: boolean, historyDays?: number }} [options]
 * @returns {Promise<{ seeded: boolean, counts?: object, sampleQrToken?: string }>}
 */
export async function seedDatabase({ reset = false, historyDays = 30 } = {}) {
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
    p.id, p.slug, p.category, p.name, p.tagline, p.product_url, p.image_url,
    p.mrp_paise, p.price_paise, JSON.stringify(p.features), p.deposit_note,
  ]);

  const storeIds = [];
  const unitsByStore = new Map();
  const cityByStore = new Map();

  MALLS.forEach(([mallId, mallName, city, address, storeId, storeCode, floor, unitNo], index) => {
    malls.push([mallId, mallName, city, address, nowIso()]);
    stores.push([
      storeId, mallId, storeCode, `Frido ${mallName}`, floor, unitNo,
      `98${between(10000000, 99999999)}`, nowIso(),
    ]);
    storeIds.push(storeId);
    cityByStore.set(storeId, city);
    unitsByStore.set(storeId, []);

    for (const product of PRODUCTS) {
      const count = product.category === 'stroller' ? 4 : 3;
      const prefix = product.category === 'stroller' ? 'STR' : 'WCH';
      for (let i = 1; i <= count; i += 1) {
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
  await bulkInsert(
    'products',
    ['id', 'slug', 'category', 'name', 'tagline', 'product_url', 'image_url', 'mrp_paise',
      'price_paise', 'features_json', 'deposit_note'],
    products,
  );
  await bulkInsert('malls', ['id', 'name', 'city', 'address', 'created_at'], malls);
  await bulkInsert(
    'stores',
    ['id', 'mall_id', 'code', 'name', 'floor', 'unit_no', 'phone', 'created_at'],
    stores,
  );
  await bulkInsert(
    'units',
    ['id', 'code', 'qr_token', 'product_id', 'store_id', 'status', 'lifetime_sessions', 'created_at'],
    units,
  );
  await bulkInsert(
    'staff',
    ['id', 'name', 'phone', 'store_id', 'pin', 'role', 'is_active', 'created_at'],
    staff,
  );
  await bulkInsert(
    'users',
    ['id', 'phone', 'name', 'email', 'city', 'whatsapp_opt_in', 'created_at', 'last_seen_at'],
    users,
  );
  await bulkInsert(
    'lead_profiles',
    ['user_id', 'primary_interest', 'need_type', 'child_age_months', 'mobility_need',
      'buying_intent', 'followup_status', 'updated_at'],
    leads,
  );
  await bulkInsert(
    'borrow_sessions',
    ['id', 'ref', 'user_id', 'unit_id', 'store_id', 'status', 'unlock_code', 'purpose',
      'party_size', 'deposit_type', 'started_at', 'due_at', 'ended_at', 'extensions',
      'return_condition', 'rating', 'feedback', 'created_at'],
    sessions,
  );
  await bulkInsert(
    'offers',
    ['id', 'code', 'user_id', 'session_id', 'product_id', 'discount_pct', 'expires_at',
      'redeemed_at', 'created_at'],
    offers,
  );
  await bulkInsert(
    'events',
    ['id', 'at', 'type', 'user_id', 'session_id', 'unit_id', 'store_id', 'payload_json'],
    events,
  );

  await run(
    `UPDATE units SET condition_note = 'Pulled for a service check' WHERE status = 'maintenance'`,
  );

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
