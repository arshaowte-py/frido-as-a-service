# Frido Assist — location tagging & the full tech system

This prototype proves the loop: scan a Frido unit in a mall → verify mobile → hand over
details instead of money → borrow free → return to the store → get a conversion offer. It
is one web app (React) + one API (Express) + one database (Postgres on Netlify).

This doc covers the two things asked for: **how location tagging should work**, and **what
else has to be built** to turn the prototype into a real operating system.

---

## Part 1 — Location tagging

### The key insight: the QR already carries location

Every unit's QR encodes a `qr_token` that resolves to exactly one unit, in one store, in
one mall. So the moment someone scans, we know — with zero GPS, zero permissions — **which
mall, which store, which floor, which product, which physical unit.** That is the primary,
most reliable location signal, and it is already live. Yulu needs GPS because its bikes
move between undefined points; our assets live at a known counter, so the sticker is a
better locator than GPS indoors (where GPS is weak anyway).

GPS/geofencing is therefore **secondary** — it adds three things the QR can't:

1. **"Nearest store" discovery** — someone opens the app cold (not from a sticker) and we
   surface the closest Frido mall store. Needs the store's pin; we now store `lat`/`lng`.
2. **Geofenced return nudges** — detect when a borrower with a live session leaves the
   mall's geofence and send "looks like you're heading out — drop the stroller at the
   Frido store on Level 1." This is the single highest-value use of location.
3. **Loss prevention** — a unit that leaves the geofence and stays out is a theft signal
   for ops, independent of the borrower's phone.

### What's already in the data model

`stores.lat`, `stores.lng`, `stores.geofence_radius_m` (default 150 m) — seeded for all 13
stores and returned by `/api/malls`, `/api/scan/:token`, `/api/stores/:id/availability`.
Coordinates today are **approximate mall pins**; before shipping geofenced features,
replace them with the exact store location from Google Business Profile (a 5-minute data
task, no code change).

### How each layer of location gets captured

| Layer | Mechanism | Reliability | Status |
|---|---|---|---|
| Mall / store / unit | QR token on the sticker | Exact | **Live** |
| Nearest store on cold open | Browser Geolocation API + haversine vs `stores.lat/lng` | Good outdoors, ~city-block indoors | Data ready; UI is a small add |
| "Still in the mall?" | Geofence (radius around store pin) checked on foreground | Coarse indoors — treat as a hint, not a lock | Data ready |
| Unit physically left the building | GPS/BLE tag on the unit (hardware) | Exact, independent of phone | Future (see Part 2) |

### Why not rely on phone GPS indoors

Malls kill GPS. Indoor accuracy is 20–100 m and jumps floors. So the design rule is:
**QR for identity and truth; GPS only for soft, cross-checkable hints** (nearest-store
ordering, a return nudge you can dismiss). Never gate a borrow or a return on GPS. If we
later want reliable indoor position (which unit is where on the floor), that's BLE
beacons, not GPS.

### Making it real (incremental)

1. **Exact store pins** — replace the approximate `lat/lng` with surveyed coordinates.
2. **Nearest-store UI** — on the home/entry screen, request geolocation (optional,
   dismissible) and sort stores by haversine distance. Pure client math; the data is
   already served. ~half a day.
3. **Return-nudge worker** — a scheduled function that, for each active+overdue session,
   sends a WhatsApp/SMS nudge; upgrade to true geofence-exit events once the guest app is
   a PWA that can report coarse location on foreground. Depends on the notification layer
   (Part 2).
4. **Asset tags** — BLE/GPS hardware on high-value units (the ₹1L+ wheelchairs) for
   loss prevention. Hardware procurement + a tag-ingest endpoint.

---

## Part 2 — The full system to build

The prototype is the thin vertical slice. Here's everything a production programme needs,
grouped, with what exists today and what to build. Ordered roughly by dependency.

### A. Identity & assets — *mostly built*
- **QR provisioning** — generate + print stickers per unit. `GET /api/staff/units/:id/qr.svg`
  exists. Add: batch print sheets, a re-issue flow for damaged stickers, tamper-evident
  sticker stock.
- **Unit registry & lifecycle** — units, statuses, condition, lifetime sessions: **built.**
  Add: purchase/onboarding date, warranty, servicing schedule, retirement.
- **Asset tracking hardware** (new) — BLE tag or GPS tracker on premium units; an ingest
  endpoint; geofence-exit alerting. Only worth it for the wheelchair line.

### B. Access & verification — *stubbed*
- **OTP over real SMS** — today the code is echoed in the response (`DEMO_MODE`). Wire an
  Indian sender: **MSG91 / Gupshup / Kaleyra**. Swap the `console.log` in
  `routes/public.js`. Add DLT template registration (mandatory for Indian SMS).
- **WhatsApp Business API** — the return reminder + offer code + care tips. This is the
  primary channel for this audience; SMS is the fallback. Consent is already captured
  (`whatsapp_opt_in`).
- **Rate limiting** — today an in-process map (bounds one warm serverless instance only).
  Move to **Redis** (Upstash) so it spans instances and survives restarts.

### C. The deposit / trust layer — *policy stub*
- Currently "photo ID held at the counter." To scale beyond staffed handover:
  - **Digital ID capture** — photograph the ID at handover, stored encrypted, auto-purged
    on return (DPDP-compliant retention).
  - **Optional card pre-authorization** — a hold (not a charge) via **Razorpay**, released
    on return; the deposit that makes unattended/high-value borrows possible.
  - **Damage flow** — photo on return, condition grading, charge-on-damage against the
    pre-auth. The `return_condition = 'damaged'` path exists; the money side doesn't.

### D. Return enforcement & fleet ops — *partial*
- **Overdue escalation** — overdue is computed live (built). Add: tiered nudges (T+15,
  T+60, T+overnight), then an ops ticket.
- **Geofence-exit worker** (see Part 1).
- **Servicing & maintenance** — schedule by lifetime sessions; the `maintenance` status
  exists; add a service log and due-for-service queue.
- **Rebalancing** — utilization analytics per store (built: borrows-per-unit on Insights)
  → move fleet from idle malls to constrained ones. Add a suggested-transfer view.

### E. Lead → conversion engine — *foundation built*
- **Lead capture & pipeline** — profile, buying intent, follow-up stages, notes, CSV
  export: **built.** 
- **CRM sync** — push leads to **HubSpot / Zoho / LeadSquared** so the existing sales team
  works them in their own tool. A webhook/worker on `lead_created` + `profile_completed`.
- **Offer engine** — today a flat 10% code minted on return (built). Add: per-product
  offers, expiry logic, demo-booking as an alternative CTA for the ₹1L wheelchair (a
  discount is the wrong hook at that price — a callback/home-trial converts better).
- **Marketing journeys** — WhatsApp drip keyed on intent: `ready_to_buy` → sales call;
  `considering` → product content; `just_borrowing` → suppressed (respect the opt-out).

### F. Analytics & BI — *foundation built*
- Funnel, daily volume, per-store leaderboard, intent mix, pipeline: **built**, derived
  from an append-only `events` table.
- Add: cohort retention (do borrowers come back / buy?), **per-mall ROI** (units × rent ×
  staff time vs leads × conversion × margin) — the number that decides which malls to keep,
  and true attribution from borrow → in-store purchase (needs the CRM/POS join).

### G. Staff & admin — *console built*
- **Store console** — live board, fleet, leads, insights, QR printing: **built.**
- Add: a **PWA** wrapper (installable, offline-tolerant, camera barcode scan for fast
  handover), native push for overdue alerts.
- **Admin/config** — onboard a new mall/store, manage staff & roles (RBAC scaffolding
  exists: associate / store_lead / admin), audit log, per-store borrow-policy overrides.

### H. Compliance & risk — *must not skip*
- **DPDP Act 2023 (India)** — this system's core asset is personal data, so it's in scope:
  explicit consent (captured), purpose limitation, a consent/audit ledger, data-subject
  access & deletion, retention limits (especially ID images). Build a consent ledger and a
  delete-my-data endpoint.
- **Liability & insurance** — a child in a borrowed stroller and a motorised wheelchair are
  real liability. Needs proper legal terms (the in-app terms are placeholder) and mall/
  product insurance sign-off. A prototype can't decide this.
- **Safety** — wheelchair handover needs a trained-associate briefing on joystick/brakes;
  keep that human, gated in the handover flow.

### I. Infrastructure — *runs today; scale path clear*
- **Today:** Netlify (static client + one serverless function) + Netlify DB (Postgres).
  Zero-ops, fine for the pilot.
- **Scale path as volume grows:**
  - Redis (Upstash) — OTP store + rate limiting + hot caches.
  - A queue (QStash / SQS) — notifications, CRM sync, geofence workers, so a slow vendor
    never blocks a request.
  - Object storage (S3/R2) — ID images and damage photos, encrypted, lifecycle-expired.
  - Observability — error tracking (Sentry), structured logs, an uptime check on
    `/api/health` (which already self-diagnoses config/DB/seed state).
  - When the single function gets busy, split the guest API and staff API and give
    analytics its own read replica.

---

## Suggested build sequence

| Phase | Goal | Ships |
|---|---|---|
| **0 — now** | Prove the loop | This prototype, live on Netlify (done) |
| **1 — pilot (2 malls, 6 wks)** | Real sign-ins, real follow-up | SMS/WhatsApp OTP, exact store pins, CRM sync, DPDP consent ledger, staff PWA |
| **2 — expand** | Reduce friction & leakage | Card pre-auth deposit, return nudges + overdue escalation, damage flow, offer/demo engine |
| **3 — scale** | Run it as a system | Asset tags on wheelchairs, rebalancing, per-mall ROI, admin/onboarding, queue + Redis + object storage |

The one metric that governs the whole thing is **borrow → walked into the store again →
bought.** Every phase above should be justified by moving that number, not by feature
completeness. The prototype already instruments the first two steps; Phase 1's CRM/POS join
closes the loop to the sale.
