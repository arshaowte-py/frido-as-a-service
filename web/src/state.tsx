import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import type { BorrowSession, GuestUser, LeadProfile, Offer, StaffMember } from './types';

const GUEST_TOKEN_KEY = 'frido.guest.token';
const STAFF_TOKEN_KEY = 'frido.staff.token';

/* ------------------------------------------------------------------------ guest */

interface GuestState {
  token: string | null;
  user: GuestUser | null;
  profile: LeadProfile | null;
  activeSession: BorrowSession | null;
  offers: Offer[];
  sessions: BorrowSession[];
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  setUser: (user: GuestUser) => void;
  setProfile: (profile: LeadProfile) => void;
}

const GuestContext = createContext<GuestState | null>(null);

interface MeResponse {
  user: GuestUser;
  profile: LeadProfile | null;
  activeSession: BorrowSession | null;
  sessions: BorrowSession[];
  offers: Offer[];
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(GUEST_TOKEN_KEY));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(GUEST_TOKEN_KEY)));

  const load = useCallback(async (activeToken: string) => {
    try {
      setMe(await api.get<MeResponse>('/me', activeToken));
    } catch {
      // An expired or tampered token should quietly drop back to signed-out.
      localStorage.removeItem(GUEST_TOKEN_KEY);
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
    else setLoading(false);
  }, [token, load]);

  const value = useMemo<GuestState>(
    () => ({
      token,
      user: me?.user ?? null,
      profile: me?.profile ?? null,
      activeSession: me?.activeSession ?? null,
      offers: me?.offers ?? [],
      sessions: me?.sessions ?? [],
      loading,
      signIn: async (next) => {
        localStorage.setItem(GUEST_TOKEN_KEY, next);
        setToken(next);
        setLoading(true);
        await load(next);
      },
      signOut: () => {
        localStorage.removeItem(GUEST_TOKEN_KEY);
        setToken(null);
        setMe(null);
      },
      refresh: async () => {
        if (token) await load(token);
      },
      setUser: (user) => setMe((prev) => (prev ? { ...prev, user } : prev)),
      setProfile: (profile) => setMe((prev) => (prev ? { ...prev, profile } : prev)),
    }),
    [token, me, loading, load],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (!context) throw new Error('useGuest must be used inside GuestProvider');
  return context;
}

/* ------------------------------------------------------------------------ staff */

interface StaffState {
  token: string | null;
  staff: StaffMember | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => void;
}

const StaffContext = createContext<StaffState | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STAFF_TOKEN_KEY));
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STAFF_TOKEN_KEY)));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ staff: StaffMember }>('/staff/me', token)
      .then((data) => setStaff(data.staff))
      .catch(() => {
        localStorage.removeItem(STAFF_TOKEN_KEY);
        setToken(null);
        setStaff(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo<StaffState>(
    () => ({
      token,
      staff,
      loading,
      signIn: async (phone, pin) => {
        const data = await api.post<{ token: string; staff: StaffMember }>('/staff/login', {
          phone,
          pin,
        });
        localStorage.setItem(STAFF_TOKEN_KEY, data.token);
        setToken(data.token);
        setStaff(data.staff);
      },
      signOut: () => {
        localStorage.removeItem(STAFF_TOKEN_KEY);
        setToken(null);
        setStaff(null);
      },
    }),
    [token, staff, loading],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const context = useContext(StaffContext);
  if (!context) throw new Error('useStaff must be used inside StaffProvider');
  return context;
}
