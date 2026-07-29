import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { Alert, Button, Card, Loading, PhoneShell, Pill, ProductArt, TopBar } from '../ui';
import type { BorrowSession } from '../types';

const pad = (value: number) => String(value).padStart(2, '0');

function useCountdown(dueAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!dueAt) return null;
  const deltaSeconds = Math.round((new Date(dueAt).getTime() - now) / 1000);
  const overdue = deltaSeconds < 0;
  const absolute = Math.abs(deltaSeconds);
  return {
    overdue,
    label: `${pad(Math.floor(absolute / 3600))}:${pad(Math.floor((absolute % 3600) / 60))}:${pad(absolute % 60)}`,
    minutes: Math.floor(absolute / 60),
  };
}

/** The screen someone actually lives in while walking around the mall. */
export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, refresh } = useGuest();

  const [session, setSession] = useState<BorrowSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<{ session: BorrowSession }>(`/sessions/${id}`, token);
      setSession(data.session);
      if (data.session.status === 'completed') navigate(`/session/${id}/wrap`, { replace: true });
    } catch (cause) {
      setError((cause as ApiError).message);
    }
  }, [id, token, navigate]);

  useEffect(() => {
    if (!token) navigate('/verify', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    void load();
    // Staff can hand over or receive from their console; poll so this screen keeps up.
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const countdown = useCountdown(session?.dueAt);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(label);
    setError(null);
    try {
      await api.post(`/sessions/${id}/${path}`, body, token);
      await load();
      await refresh();
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!session) {
    return (
      <PhoneShell>
        {error ? (
          <div className="p-5">
            <Alert>{error}</Alert>
          </div>
        ) : (
          <Loading />
        )}
      </PhoneShell>
    );
  }

  const product = session.unit?.product;
  const store = session.store;

  /* ------------------------------------------------ waiting at the counter */
  if (session.status === 'pending') {
    return (
      <PhoneShell>
        <TopBar title="Collect at the counter" subtitle={store?.name} />
        <div className="space-y-5 p-5 rise">
          <Card className="p-6 text-center">
            <p className="text-sm font-semibold text-ink-500">Show this code to the Frido team</p>
            <p className="mt-3 font-mono text-5xl font-black tracking-[0.2em] text-sky-700">
              {session.unlockCode}
            </p>
            <p className="mt-3 text-xs text-ink-400">
              Booking {session.ref} · Unit {session.unit?.code}
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink-900">Where to go</h3>
            <p className="mt-1 text-sm text-ink-500">
              {store?.name} — {store?.floor} {store?.unitNo}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              We'll hold {session.unit?.code} for you. Carry a photo ID for the counter.
            </p>
          </Card>

          {error && <Alert>{error}</Alert>}

          {/* Demo affordance: in a staffed store the associate confirms this from the console. */}
          <Button
            size="lg"
            full
            loading={busy === 'start'}
            onClick={() => act('start', 'start')}
          >
            The team handed it to me
          </Button>
          <Button
            variant="ghost"
            full
            loading={busy === 'cancel'}
            onClick={() => act('cancel', 'cancel').then(() => navigate('/'))}
          >
            Cancel this booking
          </Button>
        </div>
      </PhoneShell>
    );
  }

  /* --------------------------------------------------------- unit is out */
  const overdue = Boolean(countdown?.overdue);

  return (
    <PhoneShell>
      <TopBar
        title="In use"
        subtitle={`${session.unit?.code} · ${store?.mall?.name ?? store?.name}`}
        right={<Pill tone={overdue ? 'red' : 'green'}>{overdue ? 'Overdue' : 'Running'}</Pill>}
      />

      <div className="space-y-5 p-5 rise">
        <Card className={overdue ? 'bg-red-50 p-6 text-center ring-red-200' : 'p-6 text-center'}>
          <p className="text-sm font-semibold text-ink-500">
            {overdue ? 'Past due by' : 'Free time left'}
          </p>
          <p
            className={`tnum mt-2 text-5xl font-black tracking-tight ${
              overdue ? 'text-red-600' : 'text-ink-900'
            }`}
          >
            {countdown?.label ?? '—'}
          </p>
          <p className="mt-2 text-xs text-ink-400">
            Due{' '}
            {session.dueAt
              ? new Date(session.dueAt).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : '—'}
            {session.extensions > 0 && ` · extended ${session.extensions}×`}
          </p>
        </Card>

        {overdue && (
          <Alert>
            Your free window is over. Extend it below, or bring the unit back so someone else
            can use it — there's no late fee, we'd just like it back.
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            loading={busy === 'extend'}
            disabled={session.extensionsLeft <= 0}
            onClick={() => act('extend', 'extend')}
          >
            {session.extensionsLeft > 0 ? `+${60} min` : 'No extensions left'}
          </Button>
          <Button
            loading={busy === 'return-intent'}
            onClick={() => act('return-intent', 'return-intent').then(() => setReturning(true))}
          >
            I'm returning it
          </Button>
        </div>

        {returning && (
          <Card className="p-4 rise">
            <h3 className="text-sm font-bold text-ink-900">Before you hand it over</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-500">
              <li>· Take your bags and anything in the basket</li>
              <li>· Fold isn't needed — the team will do it</li>
              <li>· Collect your ID from the counter</li>
            </ul>
            <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
              Show booking <strong className="font-mono">{session.ref}</strong> at {store?.name},{' '}
              {store?.floor} {store?.unitNo}.
            </p>
            <Button
              className="mt-3"
              full
              loading={busy === 'complete'}
              onClick={() => act('complete', 'complete')}
            >
              The team took it back
            </Button>
            <p className="mt-2 text-center text-xs text-ink-400">
              Normally the store associate closes this from their console.
            </p>
          </Card>
        )}

        {error && <Alert>{error}</Alert>}

        <Card className="flex items-center gap-4 p-4">
          {product && (
            <ProductArt
              category={product.category}
              src={product.imageUrl}
              alt={product.name}
              className="h-16 w-20 shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-900">{product?.name}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Liking it? There's a mall-only offer waiting when you return it.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-bold text-ink-900">Return point</h3>
          <p className="mt-1 text-sm text-ink-500">
            {store?.name} — {store?.floor} {store?.unitNo}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Open until {store?.closesAt}
            {store?.phone ? ` · ${store.phone}` : ''}
          </p>
          {store?.phone && (
            <a
              href={`tel:${store.phone}`}
              className="mt-3 inline-block text-sm font-semibold text-sky-700"
            >
              Call the store for help →
            </a>
          )}
        </Card>
      </div>
    </PhoneShell>
  );
}
