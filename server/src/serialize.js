import { config } from './config.js';
import { get } from './db.js';

export function product(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    tagline: row.tagline,
    productUrl: row.product_url,
    imageUrl: row.image_url,
    mrp: row.mrp_paise == null ? null : Math.round(row.mrp_paise / 100),
    price: row.price_paise == null ? null : Math.round(row.price_paise / 100),
    features: JSON.parse(row.features_json ?? '[]'),
    depositNote: row.deposit_note,
  };
}

export function store(row, mallRow) {
  if (!row) return null;
  const mall = mallRow ?? get('SELECT * FROM malls WHERE id = ?', row.mall_id);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    floor: row.floor,
    unitNo: row.unit_no,
    phone: row.phone,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    mall: mall ? { id: mall.id, name: mall.name, city: mall.city, address: mall.address } : null,
  };
}

export function unit(row, opts = {}) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    qrToken: opts.includeToken ? row.qr_token : undefined,
    status: row.status,
    conditionNote: row.condition_note,
    lifetimeSessions: row.lifetime_sessions,
    lastServicedAt: row.last_serviced_at,
    product: opts.product ?? product(get('SELECT * FROM products WHERE id = ?', row.product_id)),
    storeId: row.store_id,
  };
}

export function borrowSession(row, opts = {}) {
  if (!row) return null;
  const now = Date.now();
  const dueMs = row.due_at ? new Date(row.due_at).getTime() : null;
  const isActive = row.status === 'active';
  return {
    id: row.id,
    ref: row.ref,
    status: row.status,
    unlockCode: row.unlock_code,
    purpose: row.purpose,
    partySize: row.party_size,
    depositType: row.deposit_type,
    startedAt: row.started_at,
    dueAt: row.due_at,
    endedAt: row.ended_at,
    extensions: row.extensions,
    extensionsLeft: Math.max(0, config.borrow.maxExtensions - row.extensions),
    returnCondition: row.return_condition,
    rating: row.rating,
    feedback: row.feedback,
    createdAt: row.created_at,
    minutesRemaining: isActive && dueMs ? Math.round((dueMs - now) / 60_000) : null,
    isOverdue: Boolean(isActive && dueMs && dueMs < now),
    durationMinutes:
      row.started_at && row.ended_at
        ? Math.round((new Date(row.ended_at) - new Date(row.started_at)) / 60_000)
        : null,
    unit: opts.unit ?? unit(get('SELECT * FROM units WHERE id = ?', row.unit_id)),
    store: opts.store ?? store(get('SELECT * FROM stores WHERE id = ?', row.store_id)),
  };
}

export function user(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    city: row.city,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    createdAt: row.created_at,
  };
}

export function leadProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    primaryInterest: row.primary_interest,
    needType: row.need_type,
    childAgeMonths: row.child_age_months,
    mobilityNeed: row.mobility_need,
    buyingIntent: row.buying_intent,
    followupStatus: row.followup_status,
    ownerStaffId: row.owner_staff_id,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export function offer(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    sessionId: row.session_id,
    discountPct: row.discount_pct,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    isExpired: new Date(row.expires_at).getTime() < Date.now(),
    product: product(get('SELECT * FROM products WHERE id = ?', row.product_id)),
  };
}

export function staffMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    storeId: row.store_id,
    store: row.store_id ? store(get('SELECT * FROM stores WHERE id = ?', row.store_id)) : null,
  };
}

export const policy = () => ({
  freeMinutes: config.borrow.freeMinutes,
  extensionMinutes: config.borrow.extensionMinutes,
  maxExtensions: config.borrow.maxExtensions,
});
