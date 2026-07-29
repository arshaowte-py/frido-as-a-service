# API reference

Base URL `/api`. JSON in, JSON out. Errors are always:

```json
{ "error": { "code": "unit_unavailable", "message": "Someone just took this one. Pick another." } }
```

`message` is written to be shown to the person on the other end; `code` is what you branch on.

Two token audiences, both `Authorization: Bearer <token>`:

- **guest** — issued by `POST /auth/otp/verify`, 12 hours
- **staff** — issued by `POST /staff/login`, 10 hours

They are not interchangeable. A guest token on a staff route returns 401 and vice versa.

---

## Public — catalogue and entry points

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness, unit count, whether OTP echo is on |
| `GET` | `/products` | Both products with pricing and features |
| `GET` | `/malls` | Malls with their Frido stores |
| `GET` | `/scan/:qrToken` | **The QR sticker target.** Unit + product + store + policy. Records a `scan` event. If the unit is out, returns free siblings in `alternatives`. |
| `GET` | `/units/:id` | Same payload without recording a scan — used by the screens after the sticker so refreshes don't inflate the funnel |
| `GET` | `/stores/:storeId/availability` | Standee QR at the shop front: what's free right now, grouped by product |

## Public — verification

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/otp/request` | `{ phone }` | Max 5 per number per hour. Returns `devCode` only while `DEV_OTP_ECHO=true`. |
| `POST` | `/auth/otp/verify` | `{ challengeId, code }` | Returns `{ token, user, profile, isNew, activeSession }`. Codes are single-use and expire in 5 minutes; 5 wrong attempts burns the challenge. |

## Guest — profile and borrowing

All require a guest token.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `GET` | `/me` | | User, lead profile, active session, history, offers |
| `PATCH` | `/me/profile` | `{ name, email?, city?, whatsappOptIn?, needType?, childAgeMonths?, mobilityNeed?, buyingIntent? }` | The data capture. `name` is required before any borrow. |
| `POST` | `/sessions` | `{ unitId \| qrToken, purpose?, partySize?, depositType?, termsAccepted: true }` | Reserves the unit and returns a 4-character `unlockCode`. 409 if the unit went in the last second, or if this guest already has one out. |
| `GET` | `/sessions/:id` | | Live state including `minutesRemaining` and `isOverdue` |
| `POST` | `/sessions/:id/start` | | Demo affordance — the store console normally does this |
| `POST` | `/sessions/:id/extend` | | +60 min, twice max. Extends from now if already overdue. |
| `POST` | `/sessions/:id/return-intent` | | Flags "walking back" and returns where to go |
| `POST` | `/sessions/:id/complete` | `{ condition? }` | Frees the unit and mints the offer |
| `POST` | `/sessions/:id/cancel` | | Only while awaiting pickup |
| `POST` | `/sessions/:id/feedback` | `{ rating, feedback?, buyingIntent? }` | Rating 1–5 |

## Staff console

`POST /staff/login` takes `{ phone, pin }`. Everything below needs a staff token.

Store leads are scoped to their own store automatically; admins may pass `?storeId=` to
narrow, or omit it for the whole estate.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/staff/me` | |
| `GET` | `/staff/stores` | Stores this member can see |
| `GET` | `/staff/overview` | Live board, fleet counts, today's numbers |
| `GET` | `/staff/units` | Fleet with the current session attached |
| `POST` | `/staff/units` | Add units. `{ productId, storeId?, count? }`. Store lead or admin. |
| `PATCH` | `/staff/units/:id` | `{ status?, conditionNote? }`. Refuses to touch a unit with a live session. |
| `GET` | `/staff/units/:id/qr.svg` | Printable sticker. Also accepts `?t=<token>` so an `<img>` can load it. |
| `POST` | `/staff/sessions/:id/handover` | `{ unlockCode }` — verifies the guest's code, then starts the clock |
| `POST` | `/staff/sessions/:id/receive` | `{ condition }` — `damaged` sends the unit to maintenance |
| `GET` | `/staff/leads` | `?status=&q=` — 500 most recent |
| `GET` | `/staff/leads.csv` | Same filters, as a download |
| `PATCH` | `/staff/leads/:userId` | `{ followupStatus?, notes?, claim? }` |
| `POST` | `/staff/offers/:code/redeem` | Marks the code used and moves the lead to `won` |
| `GET` | `/staff/analytics` | `?days=30` — funnel, daily, per-store, per-product, intent, pipeline |

---

## Event types

Everything on the insights screen is derived from the append-only `events` table, which is
why drop-offs are visible at all — a scan that never became a borrow exists nowhere else.

`scan` · `store_scan` · `otp_requested` · `otp_verified` · `lead_created` ·
`profile_completed` · `session_reserved` · `session_started` · `session_extended` ·
`return_intent` · `session_completed` · `session_cancelled` · `feedback_given` ·
`offer_issued` · `offer_redeemed` · `unit_updated` · `lead_updated` · `leads_exported` ·
`staff_login`
