/**
 * End-to-end walk through the guest journey and the staff console against a running API.
 *
 *   npm run dev            # in one terminal
 *   node scripts/smoke.mjs # in another
 *
 * Exits non-zero on the first failed expectation.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const phone = `9${String(Date.now()).slice(-9)}`;

section('Health');
const health = await api('GET', '/api/health');
check('API is up', health.status === 200 && health.body.ok, health.body);
check('database is seeded', health.body.units > 0, health.body);

section('Staff sign-in (HQ admin)');
const staffLogin = await api('POST', '/api/staff/login', {
  body: { phone: '9999999999', pin: '4321' },
});
check('admin can sign in', staffLogin.status === 200 && !!staffLogin.body.token, staffLogin.body);
const staffToken = staffLogin.body.token;

const badLogin = await api('POST', '/api/staff/login', {
  body: { phone: '9999999999', pin: '0000' },
});
check('wrong PIN is rejected', badLogin.status === 400, badLogin.body);

const units = await api('GET', '/api/staff/units', { token: staffToken });
check('fleet loads', units.status === 200 && units.body.units.length > 0);
const freeUnit = units.body.units.find((unit) => unit.status === 'available');
check('an available unit exists', !!freeUnit);

const qr = await fetch(`${BASE}/api/staff/units/${freeUnit.id}/qr.svg`, {
  headers: { authorization: `Bearer ${staffToken}` },
});
check('unit QR renders as SVG', qr.status === 200 && (await qr.text()).startsWith('<svg'));

section('Guest scans the sticker');
const scan = await api('GET', `/api/scan/${freeUnit.qrToken}`);
check('scan resolves the unit', scan.status === 200 && scan.body.unit.code === freeUnit.code, scan.body);
check('scan returns the product', !!scan.body.product?.name);
check('scan returns the store and mall', !!scan.body.store?.mall?.name);
check('scan returns the borrow policy', scan.body.policy.freeMinutes > 0);

const badScan = await api('GET', '/api/scan/not-a-real-token');
check('unknown QR is a clean 404', badScan.status === 404 && badScan.body.error.code === 'unknown_unit');

section('Mobile verification');
const badPhone = await api('POST', '/api/auth/otp/request', { body: { phone: '12345' } });
check('invalid mobile is rejected', badPhone.status === 400, badPhone.body);

const otp = await api('POST', '/api/auth/otp/request', { body: { phone } });
check('OTP is issued', otp.status === 200 && !!otp.body.challengeId, otp.body);
check('dev echo returns the code', !!otp.body.devCode);

const wrongCode = await api('POST', '/api/auth/otp/verify', {
  body: { challengeId: otp.body.challengeId, code: '000000' },
});
check('wrong OTP is rejected', wrongCode.status === 400, wrongCode.body);

const verified = await api('POST', '/api/auth/otp/verify', {
  body: { challengeId: otp.body.challengeId, code: otp.body.devCode },
});
check('correct OTP verifies', verified.status === 200 && !!verified.body.token, verified.body);
check('a new lead is created', verified.body.isNew === true);
const guestToken = verified.body.token;

const replay = await api('POST', '/api/auth/otp/verify', {
  body: { challengeId: otp.body.challengeId, code: otp.body.devCode },
});
check('OTP cannot be replayed', replay.status === 400, replay.body);

section('Data capture — the actual trade');
const tooEarly = await api('POST', '/api/sessions', {
  token: guestToken,
  body: { unitId: freeUnit.id, termsAccepted: true },
});
check('cannot borrow before giving a name', tooEarly.status === 400 && tooEarly.body.error.code === 'profile_required', tooEarly.body);

const profile = await api('PATCH', '/api/me/profile', {
  token: guestToken,
  body: {
    name: 'Smoke Test Guest',
    email: 'smoke@example.com',
    city: 'Pune',
    whatsappOptIn: true,
    primaryInterest: 'stroller',
    needType: 'toddler',
    childAgeMonths: 18,
    buyingIntent: 'considering',
  },
});
check('profile saves', profile.status === 200 && profile.body.user.name === 'Smoke Test Guest', profile.body);
check('lead attributes are captured', profile.body.profile.childAgeMonths === 18);

section('Borrow');
const created = await api('POST', '/api/sessions', {
  token: guestToken,
  body: { unitId: freeUnit.id, purpose: 'Smoke test stroll', partySize: 3, termsAccepted: true },
});
check('session is reserved', created.status === 201 && created.body.session.status === 'pending', created.body);
const session = created.body.session;
check('an unlock code is issued', !!session.unlockCode);

const doubleBook = await api('POST', '/api/sessions', {
  token: guestToken,
  body: { unitId: freeUnit.id, termsAccepted: true },
});
check('a guest cannot hold two units', doubleBook.status === 409, doubleBook.body);

const wrongHandover = await api('POST', `/api/staff/sessions/${session.id}/handover`, {
  token: staffToken,
  body: { unlockCode: 'ZZZZ' },
});
check('staff handover rejects a wrong code', wrongHandover.status === 400, wrongHandover.body);

const handover = await api('POST', `/api/staff/sessions/${session.id}/handover`, {
  token: staffToken,
  body: { unlockCode: session.unlockCode },
});
check('staff handover starts the session', handover.status === 200 && handover.body.session.status === 'active', handover.body);
check('a due time is set', !!handover.body.session.dueAt);

const unitAfterHandover = await api('GET', '/api/staff/units', { token: staffToken });
check(
  'the unit is marked in use',
  unitAfterHandover.body.units.find((unit) => unit.id === freeUnit.id)?.status === 'in_use',
);

section('In session');
const extended = await api('POST', `/api/sessions/${session.id}/extend`, { token: guestToken });
check('the guest can extend', extended.status === 200 && extended.body.session.extensions === 1, extended.body);

const returnIntent = await api('POST', `/api/sessions/${session.id}/return-intent`, { token: guestToken });
check('return intent tells them where to go', returnIntent.status === 200 && !!returnIntent.body.returnTo.name);

section('Return and convert');
const received = await api('POST', `/api/staff/sessions/${session.id}/receive`, {
  token: staffToken,
  body: { condition: 'good' },
});
check('staff can receive the unit', received.status === 200 && received.body.session.status === 'completed', received.body);
check('an offer code is minted on return', !!received.body.offer?.code, received.body.offer);
const offerCode = received.body.offer.code;

const unitAfterReturn = await api('GET', '/api/staff/units', { token: staffToken });
check(
  'the unit returns to the pool',
  unitAfterReturn.body.units.find((unit) => unit.id === freeUnit.id)?.status === 'available',
);

const feedback = await api('POST', `/api/sessions/${session.id}/feedback`, {
  token: guestToken,
  body: { rating: 5, feedback: 'Saved our afternoon.', buyingIntent: 'ready_to_buy' },
});
check('feedback is recorded', feedback.status === 200 && feedback.body.session.rating === 5, feedback.body);
check('buying intent is updated on the lead', feedback.body.profile.buyingIntent === 'ready_to_buy');

const redeem = await api('POST', `/api/staff/offers/${offerCode}/redeem`, { token: staffToken });
check('the offer redeems at the counter', redeem.status === 200 && !!redeem.body.offer.redeemedAt, redeem.body);

const reRedeem = await api('POST', `/api/staff/offers/${offerCode}/redeem`, { token: staffToken });
check('an offer cannot be redeemed twice', reRedeem.status === 409, reRedeem.body);

section('Staff console');
const overview = await api('GET', '/api/staff/overview', { token: staffToken });
check('live board loads', overview.status === 200 && typeof overview.body.fleet.available === 'number', overview.body);

const leads = await api('GET', '/api/staff/leads', { token: staffToken });
check('leads list loads', leads.status === 200 && leads.body.leads.length > 0);
const smokeLead = leads.body.leads.find((lead) => lead.user.phone === phone);
check('our guest shows up as a lead', !!smokeLead, { phone });
check('redeeming marked the lead won', smokeLead?.followupStatus === 'won', smokeLead);

const updateLead = await api('PATCH', `/api/staff/leads/${smokeLead.user.id}`, {
  token: staffToken,
  body: { followupStatus: 'demo_booked', notes: 'Wants the travel stroller in navy.', claim: true },
});
check('staff can move a lead down the pipeline', updateLead.status === 200 && updateLead.body.profile.followupStatus === 'demo_booked', updateLead.body);

const csv = await fetch(`${BASE}/api/staff/leads.csv`, {
  headers: { authorization: `Bearer ${staffToken}` },
});
const csvText = await csv.text();
check('CSV export works', csv.status === 200 && csvText.split('\n')[0].startsWith('name,phone'));
check('CSV contains our guest', csvText.includes(phone));

const analytics = await api('GET', '/api/staff/analytics', { token: staffToken });
check('analytics loads', analytics.status === 200 && analytics.body.funnel.length > 0, analytics.body);
check('funnel narrows from scan to redeem', analytics.body.funnel[0].value >= analytics.body.funnel.at(-1).value);
check('per-store breakdown is present', analytics.body.byStore.length > 0);

section('Authorisation');
const noAuth = await api('GET', '/api/staff/leads');
check('staff routes reject anonymous callers', noAuth.status === 401, noAuth.body);
const guestOnStaff = await api('GET', '/api/staff/leads', { token: guestToken });
check('a guest token cannot read staff routes', guestOnStaff.status === 401, guestOnStaff.body);
const staffOnGuest = await api('GET', '/api/me', { token: staffToken });
check('a staff token cannot read guest routes', staffOnGuest.status === 401, staffOnGuest.body);

const storeLead = await api('POST', '/api/staff/login', { body: { phone: '9002000000', pin: '1234' } });
const scopedLeads = await api('GET', '/api/staff/leads', { token: storeLead.body.token });
const scopedUnits = await api('GET', '/api/staff/units', { token: storeLead.body.token });
check('a store lead sees only their own fleet', scopedUnits.body.units.every((unit) => unit.storeId === storeLead.body.staff.storeId));
check('a store lead sees a narrower lead list', scopedLeads.body.leads.length < leads.body.leads.length);

console.log(`\n${failures.length ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failures.length} failed\x1b[0m`);
if (failures.length) {
  console.log(failures.map((name) => `  - ${name}`).join('\n'));
  process.exit(1);
}
