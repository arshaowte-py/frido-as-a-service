import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { Alert, Button, Card, Loading, Pill, PhoneShell, ProductArt, TopBar } from '../ui';
import type { ScanResult } from '../types';

/** Where a guest goes next depends on how much we already know about them. */
export function nextStep(unitId: string, opts: { signedIn: boolean; hasName: boolean }) {
  if (!opts.signedIn) return `/verify?unit=${unitId}`;
  if (!opts.hasName) return `/profile?unit=${unitId}`;
  return `/confirm?unit=${unitId}`;
}

export default function Scan() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const { token, user, activeSession } = useGuest();

  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ScanResult>(`/scan/${qrToken}`)
      .then(setData)
      .catch((cause: ApiError) => setError(cause.message));
  }, [qrToken]);

  if (error) {
    return (
      <PhoneShell>
        <TopBar title="Unknown sticker" back="/" />
        <div className="space-y-4 p-5">
          <Alert>{error}</Alert>
          <p className="text-sm text-ink-500">
            If the sticker is damaged, the Frido store team can hand you a unit directly.
          </p>
          <Button variant="secondary" full onClick={() => navigate('/')}>
            Back to start
          </Button>
        </div>
      </PhoneShell>
    );
  }

  if (!data) {
    return (
      <PhoneShell>
        <Loading label="Reading the sticker…" />
      </PhoneShell>
    );
  }

  const { unit, product, store, policy, alternatives } = data;
  const available = unit.status === 'available';
  const hours = Math.round((policy.freeMinutes / 60) * 10) / 10;

  return (
    <PhoneShell>
      <TopBar
        title={store.mall?.name ?? store.name}
        subtitle={`${store.floor ?? ''} ${store.unitNo ?? ''} · ${store.mall?.city ?? ''}`}
        back="/"
      />

      <div className="space-y-5 p-5 rise">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            <ProductArt category={product.category} className="h-24 w-28 shrink-0" />
            <div className="min-w-0">
              <Pill tone={available ? 'green' : 'amber'}>
                {available ? 'Ready to go' : 'Currently out'}
              </Pill>
              <h2 className="mt-2 text-lg font-black leading-tight text-ink-900">{product.name}</h2>
              <p className="mt-1 text-xs text-ink-400">Unit {unit.code}</p>
            </div>
          </div>
          <div className="border-t border-ink-200/70 bg-brand-50 px-4 py-3">
            <p className="text-sm font-bold text-brand-700">
              ₹0 for {hours} hours inside the mall
            </p>
            <p className="mt-0.5 text-xs text-brand-600">
              Extend by {policy.extensionMinutes} minutes, up to {policy.maxExtensions} times.
            </p>
          </div>
        </Card>

        {activeSession && (
          <Card className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink-700">
              You already have <strong>{activeSession.unit?.code}</strong> out.
            </p>
            <Button size="sm" onClick={() => navigate(`/session/${activeSession.id}`)}>
              Open
            </Button>
          </Card>
        )}

        {available && !activeSession && (
          <Button
            size="lg"
            full
            onClick={() =>
              navigate(nextStep(unit.id, { signedIn: Boolean(token), hasName: Boolean(user?.name) }))
            }
          >
            Get this — free
          </Button>
        )}

        {!available && (
          <div className="space-y-3">
            <Alert tone="amber">
              Someone is using this one right now. {alternatives.length > 0
                ? 'These are free at the same store:'
                : 'The store team can tell you when the next one is back.'}
            </Alert>
            {alternatives.map((alt) => (
              <Card key={alt.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{alt.product?.name}</p>
                  <p className="text-xs text-ink-400">Unit {alt.code}</p>
                </div>
                <Button size="sm" onClick={() => navigate(`/s/${alt.qrToken}`)}>
                  Take this
                </Button>
              </Card>
            ))}
            <Link
              to={`/store/${store.id}`}
              className="block text-center text-sm font-semibold text-brand-600"
            >
              See everything free at this store
            </Link>
          </div>
        )}

        <Card className="p-4">
          <h3 className="text-sm font-bold text-ink-900">What you're getting</h3>
          <ul className="mt-2 space-y-2">
            {product.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-ink-500">
                <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-brand-500" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
          {product.productUrl && (
            <a
              href={product.productUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-brand-600"
            >
              See the full product page →
            </a>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-bold text-ink-900">Return it here</h3>
          <p className="mt-1 text-sm text-ink-500">
            {store.name} · {store.floor} {store.unitNo}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Open {store.opensAt}–{store.closesAt}
            {store.phone ? ` · ${store.phone}` : ''}
          </p>
          {product.depositNote && (
            <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
              {product.depositNote}
            </p>
          )}
        </Card>
      </div>
    </PhoneShell>
  );
}
