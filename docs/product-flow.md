# Product flow and store operations

The engineering detail is in the README and `docs/api.md`. This is the part a store
manager or a category lead needs.

---

## The premise

A mall visitor's problem is immediate and short-lived: their toddler stopped walking, or
their mother came along and can't manage a two-hour trip. Frido already sells the exact
object that solves it, and already has a shop 40 metres away.

The offer is that they take one, free, for the length of their visit. The price is their
details and a second trip to the store.

That second trip is the part people underrate. A borrow generates two visits to the Frido
shopfront on a single mall trip — one to collect, one to return — from someone who has by
then spent two hours using the product. That is a materially better sales conversation
than any amount of window signage.

---

## What happens, step by step

**1. They notice a unit.** Strollers and wheelchairs sit at the shopfront with a QR
sticker on the handle. There's also a standee QR at the entrance for people who didn't
walk past a unit.

**2. Scan.** No app install. The sticker opens to *that exact unit* — its product, this
store, this floor, and "₹0 for 2 hours". If it's already out, the screen offers the free
siblings at the same store rather than dead-ending.

**3. Mobile + OTP.** Standard, and the same step Yulu uses. This is what makes the person
reachable.

**4. The questions.** Name, who it's for, and how old they are — or what the mobility
need is. Then, plainly: *thinking of owning one?*

Asking buying intent up front feels aggressive but it isn't, because "just today" is a
listed answer and it's honoured. It sorts the list for the store team on day one instead
of making them call 200 people to find the 30 worth calling.

**5. Terms, then hold.** Photo ID at the counter, keep it in the mall, bring it back
before closing. They tick a box and the unit is held with a 4-character code.

**6. Handover.** They show the code at the counter, the associate types it into the
console, and the clock starts. The code is what prevents someone reserving units they
never collect, and it puts the guest face-to-face with a Frido employee.

**7. The session.** A live countdown, two hours free. They can extend twice from their
phone without talking to anyone — this matters, because the alternative is people
overstaying guiltily or cutting a trip short. Overdue is a soft state: a nudge, not a fee.

**8. Return.** They tap "I'm returning it", get a short checklist (take your bags, collect
your ID), and hand it over. The associate closes it on the console.

**9. The hook.** The moment it's returned: a rating, a restated buying intent, and a
mall-only discount code on the product they just spent two hours with. Redeeming it at the
counter marks the lead `won` automatically.

---

## What the store team does

**Live tab** is the tablet that stays open at the counter. It shows who has what, how many
minutes are left, who's overdue, and who's waiting to collect. Two buttons per row: verify
and hand over, or receive back.

**Fleet tab** is the shelf. Each unit's status and lifetime borrows, plus the printable QR
sticker — that's how a new unit gets onboarded: add it, print, stick.

**Leads tab** is the callable list, filtered by pipeline stage, with call and WhatsApp
buttons and a notes field. CSV export for anyone who'd rather work in a spreadsheet or
push into a CRM.

**Insights tab** answers the two questions that decide whether this programme continues.

### Daily rhythm

- **Opening:** check the fleet tab for anything left in maintenance overnight; charge the
  wheelchairs.
- **During:** hand over and receive from the live tab. Nothing else is required.
- **Closing:** anything still `active` at closing time is on the live board — call them.
- **Weekly:** work the leads list. `Ready to buy` and 5★ ratings first.

---

## The numbers that matter

Only two, really:

1. **Scan → borrow.** If people scan and don't finish, the friction is in the middle —
   too many questions, or the ID deposit. Fix the form, not the marketing.
2. **Borrow → offer redeemed.** This is the whole commercial case. If it's near zero, the
   discount is the wrong hook and a booked demo or a home trial probably isn't.

Everything else — borrows per unit per day, average time out, intent mix, per-mall
leaderboard — is there to size the fleet and pick which malls to expand into.

Borrows per unit per day is the one to watch for fleet sizing. Under ~1.5 there are too
many units; over ~4 people are being turned away and the leaderboard is understating that
mall, because a guest who finds nothing free mostly doesn't come back later.

---

## Before this goes live

**Legal and safety** — the parts a prototype can't decide:

- Liability wording for a child in a borrowed stroller. This needs an actual lawyer, not
  the placeholder terms in `/confirm`.
- Whether the mall's own insurance covers a Frido unit on their floor, and whether they
  want a revenue share or treat it as a footfall amenity.
- A cleaning protocol between borrows, visible to the guest. Post-Covid, someone will ask.
- Wheelchair handover needs a real safety briefing on the joystick and brakes — that is a
  trained-associate task, not a screen.

**Engineering** — see the stub table in the README. The load-bearing ones are the SMS
gateway, hashed staff PINs, and removing the two guest-side demo buttons from the session
screen.

**Data protection** — the consent language is written to be honest, and WhatsApp opt-in is
a genuine checkbox rather than pre-ticked fine print. Make sure the follow-up actually
respects it, including "just borrowing" meaning no call. The programme's credibility with
mall management depends on not being a data-harvesting operation dressed as a favour.

---

## Things worth testing early

- **Dropping the ID deposit at one store.** It's the biggest friction point and the main
  reason units come back. Worth knowing which effect is larger.
- **Discount vs. demo booking as the return hook.** A wheelchair buyer at ₹1L+ probably
  wants a conversation more than 10% off.
- **A wheelchair-only pilot in a hospital-adjacent mall.** Higher-value product, sharper
  need, and the person borrowing is often not the person who'd buy — the profile question
  "who's it for" already captures that distinction.
