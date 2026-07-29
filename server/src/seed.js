/**
 * Seeds a demo estate: 12 mall stores, a fleet of units, staff logins, and ~30 days of
 * synthetic guest activity so the staff console has something to show on first run.
 *
 * Run with `npm run seed` (additive-safe: it no-ops if data exists) or `npm run reset`
 * (wipes first).
 *
 * ⚠️ PRODUCT PRICING BELOW IS A PLACEHOLDER. The live myfrido.com pages block automated
 * fetches, so MRP / selling price / feature copy were filled in by hand and must be
 * checked against the PDPs before this is shown to anyone outside the team.
 */
import { db, migrate, get, run } from './db.js';
import { addMinutes, humanCode, id, nowIso } from './util.js';

const RESET = process.argv.includes('--reset');

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
const rand = mulberry32(20260729);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (probability) => rand() < probability;

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
    deposit_note: 'Any photo ID held at the counter. A staff member walks you through the controls first.',
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
const MOBILITY_NEEDS = ['elderly_parent', 'post_surgery', 'chronic_pain', 'permanent_mobility_aid', 'injury_recovery'];
const INTENTS = ['just_borrowing', 'curious', 'considering', 'ready_to_buy'];
const FOLLOWUPS = ['new', 'new', 'new', 'contacted', 'contacted', 'demo_booked', 'won', 'lost'];

function wipe() {
  for (const table of [
    'events', 'offers', 'borrow_sessions', 'lead_profiles', 'otp_challenges', 'users',
    'units', 'staff', 'stores', 'malls', 'products',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
}

function event(type, at, fields = {}) {
  run(
    `INSERT INTO events (id, at, type, user_id, session_id, unit_id, store_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    at,
    type,
    fields.userId ?? null,
    fields.sessionId ?? null,
    fields.unitId ?? null,
    fields.storeId ?? null,
    fields.payload ? JSON.stringify(fields.payload) : null,
  );
}

function seed() {
  migrate();
  if (RESET) wipe();

  if (get('SELECT COUNT(*) AS count FROM units').count > 0) {
    console.log('Database already seeded. Use `npm run reset` to rebuild it.');
    return;
  }

  const now = new Date();

  for (const product of PRODUCTS) {
    run(
      `INSERT INTO products
         (id, slug, category, name, tagline, product_url, image_url, mrp_paise, price_paise,
          features_json, deposit_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      product.id, product.slug, product.category, product.name, product.tagline,
      product.product_url, product.image_url, product.mrp_paise, product.price_paise,
      JSON.stringify(product.features), product.deposit_note,
    );
  }

  const storeIds = [];
  for (const [mallId, mallName, city, address, storeId, storeCode, floor, unitNo] of MALLS) {
    run('INSERT INTO malls (id, name, city, address, created_at) VALUES (?, ?, ?, ?, ?)',
      mallId, mallName, city, address, nowIso());
    run(
      `INSERT INTO stores (id, mall_id, code, name, floor, unit_no, phone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      storeId, mallId, storeCode, `Frido ${mallName}`, floor, unitNo,
      `98${between(10000000, 99999999)}`, nowIso(),
    );
    storeIds.push(storeId);

    for (const product of PRODUCTS) {
      const count = product.category === 'stroller' ? 4 : 3;
      const prefix = product.category === 'stroller' ? 'STR' : 'WCH';
      for (let i = 1; i <= count; i += 1) {
        run(
          `INSERT INTO units (id, code, qr_token, product_id, store_id, status, lifetime_sessions, created_at)
           VALUES (?, ?, ?, ?, ?, 'available', ?, ?)`,
          id(),
          `FRD-${storeCode}-${prefix}-${String(i).padStart(3, '0')}`,
          `u_${storeCode.toLowerCase()}${prefix.toLowerCase()}${i}${humanCode(5).toLowerCase()}`,
          product.id, storeId, between(4, 90), nowIso(),
        );
      }
    }

    run(
      `INSERT INTO staff (id, name, phone, store_id, pin, role, created_at)
       VALUES (?, ?, ?, ?, ?, 'store_lead', ?)`,
      id(), `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      `90${String(storeIds.length).padStart(2, '0')}000000`, storeId, '1234', nowIso(),
    );
  }

  run(
    `INSERT INTO staff (id, name, phone, store_id, pin, role, created_at)
     VALUES (?, 'Frido Ops (HQ)', '9999999999', NULL, '4321', 'admin', ?)`,
    id(), nowIso(),
  );

  // --- 30 days of history -------------------------------------------------------
  const historyDays = 30;
  let sessionTotal = 0;

  for (let dayOffset = historyDays; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60_000);
    const isWeekend = [0, 6].includes(day.getDay());
    const sessionsToday = isWeekend ? between(9, 16) : between(3, 8);

    // Scans that never turned into anything — the top of the funnel has to be wider.
    for (let i = 0; i < sessionsToday * 2; i += 1) {
      const storeId = pick(storeIds);
      const at = new Date(day).setHours(between(10, 21), between(0, 59));
      event('scan', new Date(at).toISOString(), { storeId });
      if (chance(0.55)) event('otp_requested', new Date(at + 40_000).toISOString(), { storeId });
    }

    for (let i = 0; i < sessionsToday; i += 1) {
      const storeId = pick(storeIds);
      const unitRow = get(
        `SELECT * FROM units WHERE store_id = ? ORDER BY RANDOM() LIMIT 1`,
        storeId,
      );
      const productRow = get('SELECT * FROM products WHERE id = ?', unitRow.product_id);
      const isStroller = productRow.category === 'stroller';

      const startHour = between(11, 20);
      const createdAt = new Date(new Date(day).setHours(startHour, between(0, 59), 0, 0)).toISOString();

      const userId = id();
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const phone = `${pick(['6', '7', '8', '9'])}${between(100000000, 999999999)}`;
      const storeCity = get(
        'SELECT m.city FROM stores s JOIN malls m ON m.id = s.mall_id WHERE s.id = ?',
        storeId,
      ).city;

      run(
        `INSERT INTO users (id, phone, name, email, city, whatsapp_opt_in, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, phone, name,
        chance(0.55) ? `${name.split(' ')[0].toLowerCase()}${between(10, 999)}@example.com` : null,
        storeCity, chance(0.72) ? 1 : 0, createdAt, createdAt,
      );

      const intent = chance(0.25) ? pick(INTENTS.slice(2)) : pick(INTENTS.slice(0, 3));
      run(
        `INSERT INTO lead_profiles
           (user_id, primary_interest, need_type, child_age_months, mobility_need, buying_intent,
            followup_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, productRow.category,
        isStroller ? pick(NEED_TYPES_STROLLER) : 'mobility_support',
        isStroller ? between(4, 48) : null,
        isStroller ? null : pick(MOBILITY_NEEDS),
        intent, pick(FOLLOWUPS), createdAt,
      );

      event('scan', createdAt, { storeId, unitId: unitRow.id, userId });
      event('otp_requested', addMinutes(createdAt, 1), { storeId, userId });
      event('lead_created', addMinutes(createdAt, 2), { storeId, userId });
      event('profile_completed', addMinutes(createdAt, 3), { storeId, userId });

      // A slice of guests reserve and then wander off without collecting.
      const abandoned = chance(0.08);
      const startedAt = addMinutes(createdAt, between(3, 9));
      const durationMinutes = between(35, 190);
      const endedAt = addMinutes(startedAt, durationMinutes);
      const extensions = durationMinutes > 120 ? Math.min(2, Math.ceil((durationMinutes - 120) / 60)) : 0;

      const sessionId = id();
      const ref = humanCode(6);
      run(
        `INSERT INTO borrow_sessions
           (id, ref, user_id, unit_id, store_id, status, unlock_code, purpose, party_size,
            deposit_type, started_at, due_at, ended_at, extensions, return_condition, rating,
            feedback, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'id_card', ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId, ref, userId, unitRow.id, storeId,
        abandoned ? 'cancelled' : 'completed',
        humanCode(4),
        isStroller ? pick(STROLLER_PURPOSES) : pick(WHEELCHAIR_PURPOSES),
        between(2, 5),
        abandoned ? null : startedAt,
        abandoned ? null : addMinutes(startedAt, 120 + extensions * 60),
        abandoned ? addMinutes(createdAt, 30) : endedAt,
        abandoned ? 0 : extensions,
        abandoned ? null : (chance(0.04) ? 'damaged' : 'good'),
        abandoned ? null : (chance(0.85) ? between(4, 5) : between(2, 3)),
        null,
        createdAt,
      );
      sessionTotal += 1;

      if (abandoned) {
        event('session_reserved', createdAt, { storeId, userId, sessionId, unitId: unitRow.id });
        event('session_cancelled', addMinutes(createdAt, 30), { storeId, userId, sessionId });
        continue;
      }

      event('session_reserved', createdAt, { storeId, userId, sessionId, unitId: unitRow.id });
      event('session_started', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
      for (let e = 0; e < extensions; e += 1) {
        event('session_extended', addMinutes(startedAt, 110 + e * 60), { storeId, userId, sessionId });
      }
      event('session_completed', endedAt, { storeId, userId, sessionId, unitId: unitRow.id });
      event('feedback_given', addMinutes(endedAt, 2), { storeId, userId, sessionId });

      // Offer issued on return; a minority come back to the counter and use it.
      const offerCode = `MALL${humanCode(4)}`;
      const redeemed = chance(0.11);
      run(
        `INSERT INTO offers (id, code, user_id, session_id, product_id, discount_pct, expires_at, redeemed_at, created_at)
         VALUES (?, ?, ?, ?, ?, 10, ?, ?, ?)`,
        id(), offerCode, userId, sessionId, productRow.id,
        addMinutes(endedAt, 7 * 24 * 60),
        redeemed ? addMinutes(endedAt, between(20, 2000)) : null,
        endedAt,
      );
      event('offer_issued', endedAt, { storeId, userId, sessionId, payload: { code: offerCode } });
      if (redeemed) {
        event('offer_redeemed', addMinutes(endedAt, 30), { storeId, userId, sessionId, payload: { code: offerCode } });
        run(`UPDATE lead_profiles SET followup_status = 'won' WHERE user_id = ?`, userId);
      }
    }
  }

  // --- a handful of sessions running right now, for the live board ----------------
  for (let i = 0; i < 7; i += 1) {
    const storeId = pick(storeIds);
    const unitRow = get(
      `SELECT * FROM units WHERE store_id = ? AND status = 'available' ORDER BY RANDOM() LIMIT 1`,
      storeId,
    );
    if (!unitRow) continue;
    const productRow = get('SELECT * FROM products WHERE id = ?', unitRow.product_id);
    const isStroller = productRow.category === 'stroller';
    const pending = i < 2;
    // One of the live sessions is deliberately past due so the overdue path is visible.
    const startedAgo = i === 2 ? between(150, 200) : between(15, 100);
    const startedAt = addMinutes(nowIso(), -startedAgo);

    const userId = id();
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    run(
      `INSERT INTO users (id, phone, name, city, whatsapp_opt_in, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      userId, `${pick(['6', '7', '8', '9'])}${between(100000000, 999999999)}`, name,
      get('SELECT m.city FROM stores s JOIN malls m ON m.id = s.mall_id WHERE s.id = ?', storeId).city,
      startedAt, nowIso(),
    );
    run(
      `INSERT INTO lead_profiles (user_id, primary_interest, need_type, child_age_months, mobility_need, buying_intent, followup_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
      userId, productRow.category,
      isStroller ? pick(NEED_TYPES_STROLLER) : 'mobility_support',
      isStroller ? between(4, 48) : null,
      isStroller ? null : pick(MOBILITY_NEEDS),
      pick(INTENTS), nowIso(),
    );

    const sessionId = id();
    run(
      `INSERT INTO borrow_sessions
         (id, ref, user_id, unit_id, store_id, status, unlock_code, purpose, party_size,
          deposit_type, started_at, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'id_card', ?, ?, ?)`,
      sessionId, humanCode(6), userId, unitRow.id, storeId,
      pending ? 'pending' : 'active', humanCode(4),
      isStroller ? pick(STROLLER_PURPOSES) : pick(WHEELCHAIR_PURPOSES),
      between(2, 5),
      pending ? null : startedAt,
      pending ? null : addMinutes(startedAt, 120),
      pending ? addMinutes(nowIso(), -between(2, 12)) : startedAt,
    );
    run(`UPDATE units SET status = ? WHERE id = ?`, pending ? 'reserved' : 'in_use', unitRow.id);
    event('session_reserved', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
    if (!pending) event('session_started', startedAt, { storeId, userId, sessionId, unitId: unitRow.id });
    sessionTotal += 1;
  }

  // A couple of units off the floor for servicing, so the fleet view isn't all green.
  for (const row of db.prepare(`SELECT id FROM units WHERE status = 'available' ORDER BY RANDOM() LIMIT 3`).all()) {
    run(
      `UPDATE units SET status = 'maintenance', condition_note = ?, last_serviced_at = ? WHERE id = ?`,
      pick(['Front wheel squeaks', 'Harness strap frayed', 'Battery needs a full charge cycle']),
      addMinutes(nowIso(), -between(600, 4000)),
      row.id,
    );
  }

  const counts = {
    malls: get('SELECT COUNT(*) AS c FROM malls').c,
    stores: get('SELECT COUNT(*) AS c FROM stores').c,
    units: get('SELECT COUNT(*) AS c FROM units').c,
    guests: get('SELECT COUNT(*) AS c FROM users').c,
    sessions: sessionTotal,
    staff: get('SELECT COUNT(*) AS c FROM staff').c,
  };

  console.log('\nSeeded Frido-as-a-Service demo estate:');
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(9)} ${value}`);
  }

  const sampleUnit = get(`SELECT code, qr_token FROM units WHERE status = 'available' LIMIT 1`);
  console.log(`\n  Try a scan:  /s/${sampleUnit.qr_token}   (unit ${sampleUnit.code})`);
  console.log('  Staff login: 9999999999 / 4321  (HQ admin, sees every store)');
  console.log('               9001000000 / 1234  (store lead, Phoenix Palladium Mumbai)\n');
}

seed();
