# Frido-as-a-Service

**Free strollers and wheelchairs, borrowed on the mall floor. Yulu's flow, mapped onto Frido's in-mall stores.**

Someone in a mall needs a stroller because their toddler is done walking, or a wheelchair
because their mother came along today. They scan the QR sticker on a Frido unit, verify
their mobile, answer two questions, and walk away with it. They bring it back to the Frido
store on the way out, and a mall-only discount lands on their screen.

They pay nothing. What Frido gets is a named person with a stated need, two trips to the
store, and a reason to call them next week.

Frido has stores in 13 malls. This is the prototype for running that programme.

For location tagging and everything a full production system needs, see
**[docs/system-architecture.md](docs/system-architecture.md)**.

<!-- Screens: guest journey is mobile-first; the store console is a counter tablet. -->

---

## Run it

```bash
npm install
cp .env.example .env
npm run seed        # 12 mall stores, 84 units, 30 days of activity
npm run dev         # API on :4000, web on :5173
```

Open **http://localhost:5173**.

- The home page is a demo front door — pick a mall and "Simulate a scan" to enter the
  guest journey exactly where a real QR sticker would drop you.
- OTPs are not sent by SMS. While `DEV_OTP_ECHO=true` the code comes back in the API
  response and is pre-filled on screen, so one person can walk the whole flow.
- Store console: **/staff/login**
  - `9999999999` / `4321` — HQ admin, sees every store
  - `9001000000` / `1234` — store lead, Phoenix Palladium Mumbai (scoped to that store)

```bash
npm run smoke       # 53 end-to-end checks against a running API
npm run reset       # wipe and rebuild the demo estate
npm run build       # build the client; `npm start` then serves it from the API
```

Requires Node 22.5+ (the API uses the built-in `node:sqlite`).

## Hosting

Both halves run on one Netlify site: the client from the CDN, the whole Express API as a
single function, and Netlify DB (Postgres) behind it. The site, its environment variables
and the schema migration are already set up — **[docs/deploy-netlify.md](docs/deploy-netlify.md)**
has the remaining steps and what changes about the OTP path once it's public.

The data layer picks its driver from the environment: Postgres when a connection string is
present, otherwise the local SQLite file. Nothing above changes.

---

## The flow, and where it came from

Yulu's loop is: find a vehicle → scan → verify mobile → unlock → ride with a live timer →
park in a zone → pay → rate. Every step has a mall equivalent, except that the payment
step is where we collect data instead of money.

| Yulu | Here |
| --- | --- |
| Walk up to a bike | Walk up to a stroller parked at the Frido store |
| Scan the QR on the frame | Scan the QR sticker on that exact unit (`/s/:qrToken`) |
| Mobile + OTP | Same |
| Wallet balance / payment method | **Name, who it's for, their need, buying intent** — the actual price |
| Unlock the bike over IoT | A 4-character code the store associate verifies at the counter |
| Ride screen: timer, map, end ride | Session screen: countdown, extend, return checklist, store directions |
| Park in a Yulu Zone | Return to the Frido store counter |
| Fare charged | ₹0 — instead a mall-only discount code is minted |
| Rate the ride | Rate the unit, state buying intent |
| Ops dashboard | Store console: live board, fleet, leads, insights |

The two products are the
[Frido Autofold Travel Stroller](https://myfrido.com/products/frido-autofold-travel-stroller)
and the
[Frido Prime Plus Electric Wheelchair](https://mobility.myfrido.com/products/frido-prime-plus-electric-wheelchair).

> ⚠️ **Product pricing and feature copy in the seed are placeholders.** Both PDPs block
> automated fetches, so the values in `server/src/seed.js` were filled in by hand and have
> not been verified against the live pages. Correct them there before showing this to
> anyone outside the team — it is one object per product.

---

## What's in the box

### Guest journey (mobile-first)

| Route | Screen |
| --- | --- |
| `/` | Demo front door — explains the model, launches a scan |
| `/s/:qrToken` | The sticker landing: this unit, this store, free for 2 hours |
| `/store/:storeId` | Standee QR at the shop front — what's free right now |
| `/verify` | Mobile + OTP |
| `/profile` | The trade: name, who it's for, need, buying intent, WhatsApp consent |
| `/confirm` | Purpose, terms, hold the unit |
| `/session/:id` | Pickup code, then the live countdown, extend, return checklist |
| `/session/:id/wrap` | Rating, stated intent, and the in-mall offer code |
| `/me` | Past borrows and live offers |

### Store console (counter tablet)

| Route | Screen |
| --- | --- |
| `/staff` | Live board — who has what, minutes left, overdue, hand over / receive back |
| `/staff/fleet` | Every unit, its status, and its printable QR sticker |
| `/staff/leads` | The callable list, with pipeline stages, notes, call/WhatsApp, CSV export |
| `/staff/insights` | Scan-to-sale funnel, borrows per day, per-store leaderboard, intent mix |

Store leads see only their own store; HQ admins see the whole estate. The scoping is
enforced server-side, not in the UI.

---

## Architecture

```
server/            Express 5 API on Node's built-in node:sqlite — no native deps
  src/schema.sql   Whole data model in one readable file
  src/routes/      public.js (guest journey) · staff.js (console)
  src/seed.js      12 mall stores, 84 units, 30 days of synthetic activity
web/               Vite + React + TypeScript + Tailwind v4
scripts/smoke.mjs  53 end-to-end checks across both surfaces
```

Four runtime dependencies on the server (`express`, `cors`, `zod`, `qrcode`) and no build
step for it. SQLite is a single file under `server/data/`; the schema is ordinary SQL and
moves to Postgres without a rewrite when the pilot outgrows one box.

Design tokens live in one `@theme` block at the top of `web/src/index.css`. The brand
colours there are stand-ins — replace the hex values and the whole app follows.

### A few decisions worth knowing

- **Two auth audiences.** Guest and staff tokens are signed with the same secret but carry
  different `aud` claims, so a guest token is rejected on staff routes and vice versa.
  There's a test for each direction.
- **The unit is claimed with a conditional UPDATE**, not a read-then-write, so two people
  scanning the same sticker at once can't both get it.
- **Analytics are derived from an append-only `events` table**, not counted off the
  sessions table. Drop-offs — scans that never became a borrow — only exist there.
- **Overdue is computed, not stored.** No cron job needed to flip a status.
- **Every borrow mints an offer on return.** That's the conversion hook, and redeeming it
  at the counter automatically moves the lead to `won`.

---

## What is real, and what is stubbed

**Real:** the whole borrow lifecycle, OTP verification with hashed codes and replay
protection, store-scoped authorisation, fleet state machine, lead pipeline, CSV export,
QR generation, funnel analytics.

**Stubbed for the prototype, and where to fix it:**

| Stub | What production needs |
| --- | --- |
| `DEV_OTP_ECHO` returns the OTP in the response | An SMS gateway (MSG91/Gupshup). Env keys are already sketched in `.env.example`; swap the `console.log` in `routes/public.js`. |
| "The team handed it to me" / "The team took it back" buttons | Staff-only in a real store — the console already does both properly. Remove the two guest buttons in `web/src/pages/Session.tsx`. |
| Staff PINs stored in plain text | Hash them, and issue PINs per person rather than per store. |
| No WhatsApp send | Return reminders and the offer code are consented to but not delivered. |
| In-memory OTP rate limiting | Move to Redis so it survives a restart and spans instances. |
| No photo of the unit's condition on return | Damage disputes will want one. |

---

## If this becomes a pilot

The thing to prove is not that people will take a free stroller — they will. It's
**scan → borrow** and **borrow → walked into the store again**. Both are on the insights
screen from day one.

A sensible first pilot: two malls, one metro and one tier-2, six weeks, ~8 units each.
Watch borrows per unit per day (the leaderboard column) to size the fleet, and watch the
offer redemption rate to decide whether the discount is the right hook or whether it
should be a demo booking instead.

Operationally, the loose end that matters most is the ID deposit. It's the reason someone
brings the unit back, and it's also the most annoying part of the flow. Worth testing a
version without one at a single store to see whether return rates actually move.
