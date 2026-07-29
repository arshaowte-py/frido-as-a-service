-- Frido-as-a-Service schema.
-- All timestamps are ISO-8601 UTC strings so the file stays readable with any SQLite client.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS malls (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id          TEXT PRIMARY KEY,
  mall_id     TEXT NOT NULL REFERENCES malls(id),
  -- Short code stamped onto unit labels, e.g. PHXM in FRD-PHXM-STR-001.
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  floor       TEXT,
  unit_no     TEXT,
  phone       TEXT,
  opens_at    TEXT NOT NULL DEFAULT '10:00',
  closes_at   TEXT NOT NULL DEFAULT '22:00',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stores_mall ON stores(mall_id);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL CHECK (category IN ('stroller', 'wheelchair')),
  name          TEXT NOT NULL,
  tagline       TEXT,
  product_url   TEXT,
  image_url     TEXT,
  mrp_paise     INTEGER,
  price_paise   INTEGER,
  features_json TEXT NOT NULL DEFAULT '[]',
  deposit_note  TEXT
);

-- A physical stroller / wheelchair sitting in a mall store. The QR sticker on the unit
-- encodes qr_token, which is the entry point for the whole guest flow.
CREATE TABLE IF NOT EXISTS units (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  qr_token          TEXT NOT NULL UNIQUE,
  product_id        TEXT NOT NULL REFERENCES products(id),
  store_id          TEXT NOT NULL REFERENCES stores(id),
  status            TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'reserved', 'in_use', 'maintenance', 'retired')),
  condition_note    TEXT,
  lifetime_sessions INTEGER NOT NULL DEFAULT 0,
  last_serviced_at  TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_units_store ON units(store_id, status);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT,
  email           TEXT,
  city            TEXT,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  last_seen_at    TEXT
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id          TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_challenges(phone, created_at);

CREATE TABLE IF NOT EXISTS borrow_sessions (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  user_id          TEXT NOT NULL REFERENCES users(id),
  unit_id          TEXT NOT NULL REFERENCES units(id),
  store_id         TEXT NOT NULL REFERENCES stores(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  unlock_code      TEXT NOT NULL,
  purpose          TEXT,
  party_size       INTEGER,
  deposit_type     TEXT,
  started_at       TEXT,
  due_at           TEXT,
  ended_at         TEXT,
  extensions       INTEGER NOT NULL DEFAULT 0,
  return_condition TEXT,
  rating           INTEGER,
  feedback         TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON borrow_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_store ON borrow_sessions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON borrow_sessions(status, due_at);

CREATE TABLE IF NOT EXISTS staff (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  store_id   TEXT REFERENCES stores(id),
  pin        TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'associate'
             CHECK (role IN ('associate', 'store_lead', 'admin')),
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- The commercial point of the whole exercise: what we learned about this person, and
-- where they are in the follow-up pipeline.
CREATE TABLE IF NOT EXISTS lead_profiles (
  user_id          TEXT PRIMARY KEY REFERENCES users(id),
  primary_interest TEXT,
  need_type        TEXT,
  child_age_months INTEGER,
  mobility_need    TEXT,
  buying_intent    TEXT,
  followup_status  TEXT NOT NULL DEFAULT 'new'
                   CHECK (followup_status IN ('new', 'contacted', 'demo_booked', 'won', 'lost')),
  owner_staff_id   TEXT REFERENCES staff(id),
  notes            TEXT,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON lead_profiles(followup_status, updated_at);

CREATE TABLE IF NOT EXISTS offers (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  session_id  TEXT REFERENCES borrow_sessions(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  discount_pct INTEGER NOT NULL,
  expires_at  TEXT NOT NULL,
  redeemed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_user ON offers(user_id);

-- Append-only funnel log. Everything the staff console charts is derived from here.
CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  type         TEXT NOT NULL,
  user_id      TEXT,
  session_id   TEXT,
  unit_id      TEXT,
  store_id     TEXT,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, at);
CREATE INDEX IF NOT EXISTS idx_events_store ON events(store_id, at);
