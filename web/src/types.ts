export type Category = 'stroller' | 'wheelchair';
export type UnitStatus = 'available' | 'reserved' | 'in_use' | 'maintenance' | 'retired';
export type SessionStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type BuyingIntent = 'just_borrowing' | 'curious' | 'considering' | 'ready_to_buy';
export type FollowupStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost';

export interface Product {
  id: string;
  slug: string;
  category: Category;
  name: string;
  tagline: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  mrp: number | null;
  price: number | null;
  features: string[];
  depositNote: string | null;
}

export interface Mall {
  id: string;
  name: string;
  city: string;
  address: string | null;
}

export interface Store {
  id: string;
  code: string;
  name: string;
  floor: string | null;
  unitNo: string | null;
  phone: string | null;
  opensAt: string;
  closesAt: string;
  mall: Mall | null;
}

export interface Unit {
  id: string;
  code: string;
  qrToken?: string;
  status: UnitStatus;
  conditionNote: string | null;
  lifetimeSessions: number;
  lastServicedAt: string | null;
  product: Product | null;
  storeId: string;
}

export interface Policy {
  freeMinutes: number;
  extensionMinutes: number;
  maxExtensions: number;
}

export interface BorrowSession {
  id: string;
  ref: string;
  status: SessionStatus;
  unlockCode: string;
  purpose: string | null;
  partySize: number | null;
  depositType: string | null;
  startedAt: string | null;
  dueAt: string | null;
  endedAt: string | null;
  extensions: number;
  extensionsLeft: number;
  returnCondition: string | null;
  rating: number | null;
  feedback: string | null;
  createdAt: string;
  minutesRemaining: number | null;
  isOverdue: boolean;
  durationMinutes: number | null;
  unit: Unit | null;
  store: Store | null;
}

export interface GuestUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  city: string | null;
  whatsappOptIn: boolean;
  createdAt: string;
}

export interface LeadProfile {
  userId: string;
  primaryInterest: string | null;
  needType: string | null;
  childAgeMonths: number | null;
  mobilityNeed: string | null;
  buyingIntent: BuyingIntent | null;
  followupStatus: FollowupStatus;
  ownerStaffId: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface Offer {
  id: string;
  code: string;
  sessionId: string | null;
  discountPct: number;
  expiresAt: string;
  redeemedAt: string | null;
  isExpired: boolean;
  product: Product | null;
}

export interface StaffMember {
  id: string;
  name: string;
  phone: string | null;
  role: 'associate' | 'store_lead' | 'admin';
  storeId: string | null;
  store: Store | null;
}

export interface ScanResult {
  unit: Unit;
  product: Product;
  store: Store;
  policy: Policy;
  alternatives: Unit[];
  activeSession: BorrowSession | null;
}

export interface StoreAvailability {
  store: Store;
  policy: Policy;
  products: { product: Product; availableCount: number; units: Unit[] }[];
}

export interface Lead {
  user: GuestUser;
  primaryInterest: string | null;
  needType: string | null;
  childAgeMonths: number | null;
  mobilityNeed: string | null;
  buyingIntent: BuyingIntent | null;
  followupStatus: FollowupStatus;
  ownerStaffId: string | null;
  notes: string | null;
  sessionCount: number;
  lastSessionAt: string | null;
  avgRating: number | null;
  updatedAt: string | null;
}

export interface LiveSession extends BorrowSession {
  guest: GuestUser | null;
}

export interface Overview {
  live: LiveSession[];
  overdueCount: number;
  awaitingHandover: number;
  fleet: { available: number; reserved: number; inUse: number; maintenance: number; retired: number };
  today: { sessions: number; completed: number; newLeads: number };
}

export interface FleetUnit extends Unit {
  store: Store | null;
  currentSession: LiveSession | null;
}

export interface Analytics {
  windowDays: number;
  funnel: { key: string; label: string; value: number }[];
  daily: { day: string; sessions: number; completed: number }[];
  byStore: {
    storeId: string;
    storeName: string;
    mallName: string;
    city: string;
    sessions: number;
    guests: number;
    unitCount: number;
    avgRating: number | null;
    sessionsPerUnit: number;
  }[];
  byProduct: { name: string; category: Category; sessions: number; avgRating: number | null }[];
  intent: { intent: string; count: number }[];
  pipeline: { status: string; count: number }[];
  avgSessionMinutes: number | null;
}
