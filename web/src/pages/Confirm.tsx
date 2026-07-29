import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { Alert, Button, Card, Choice, Field, Input, Loading, PhoneShell, ProductArt, TopBar } from '../ui';
import type { BorrowSession, Policy, Product, Store, Unit } from '../types';

interface UnitResponse {
  unit: Unit;
  product: Product;
  store: Store;
  policy: Policy;
}

const STROLLER_PURPOSES = [
  'Toddler got tired',
  'Long shopping trip',
  'Movie and dinner',
  'Kid is asleep',
];
const WHEELCHAIR_PURPOSES = [
  'Elderly parent with us',
  'Recovering from surgery',
  'Knee or back pain',
  'Long walk today',
];

/** Last screen before the unit is held for them. Terms, then it's theirs. */
export default function Confirm() {
  const [params] = useSearchParams();
  const unitId = params.get('unit');
  const navigate = useNavigate();
  const { token, user, activeSession } = useGuest();

  const [context, setContext] = useState<UnitResponse | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [partySize, setPartySize] = useState('2');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) navigate(`/verify${unitId ? `?unit=${unitId}` : ''}`, { replace: true });
    else if (!user?.name) navigate(`/profile?unit=${unitId ?? ''}`, { replace: true });
    else if (activeSession) navigate(`/session/${activeSession.id}`, { replace: true });
  }, [token, user, activeSession, unitId, navigate]);

  useEffect(() => {
    if (unitId) api.get<UnitResponse>(`/units/${unitId}`).then(setContext).catch(() => setContext(null));
  }, [unitId]);

  if (!context) {
    return (
      <PhoneShell>
        <Loading />
      </PhoneShell>
    );
  }

  const hours = Math.round((context.policy.freeMinutes / 60) * 10) / 10;
  const purposes = context.product.category === 'wheelchair' ? WHEELCHAIR_PURPOSES : STROLLER_PURPOSES;

  async function reserve(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.post<{ session: BorrowSession }>(
        '/sessions',
        {
          unitId,
          purpose: purpose ?? undefined,
          partySize: Number(partySize) || undefined,
          depositType: 'id_card',
          termsAccepted: true,
        },
        token,
      );
      navigate(`/session/${data.session.id}`, { replace: true });
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <TopBar title="Confirm the pickup" subtitle={context.store.name} back={`/profile?unit=${unitId}`} />

      <form onSubmit={reserve} className="space-y-5 p-5 rise">
        <Card className="flex items-center gap-4 p-4">
          <ProductArt category={context.product.category} className="h-20 w-24 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink-900">{context.product.name}</h2>
            <p className="text-xs text-ink-400">Unit {context.unit.code}</p>
            <p className="mt-1.5 text-sm font-bold text-brand-600">₹0 for {hours} hours</p>
          </div>
        </Card>

        <Field label="What's it for today?" hint="Helps the store team hand you the right setup" group>
          <Choice
            columns={1}
            options={purposes.map((value) => ({ value, label: value }))}
            value={purpose}
            onChange={setPurpose}
          />
        </Field>

        <Field label="How many in your group?">
          <Input
            type="number"
            min={1}
            max={10}
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
          />
        </Field>

        <Card className="p-4">
          <h3 className="text-sm font-bold text-ink-900">The terms, in plain words</h3>
          <ul className="mt-2 space-y-2 text-sm text-ink-500">
            <li>· Free for {hours} hours. Extend twice from your phone if you need longer.</li>
            <li>· Any photo ID stays at the counter and comes back when the unit does.</li>
            <li>· Please keep it inside the mall — it isn't insured on the road or in the car park.</li>
            <li>· Damage beyond normal use may be charged at cost. Tell us and we'll sort it out.</li>
            <li>· Return before the store closes at {context.store.closesAt}.</li>
          </ul>
        </Card>

        <label className="flex items-start gap-3 rounded-xl bg-white p-3.5 ring-1 ring-ink-200">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-5 rounded accent-[var(--color-brand-600)]"
          />
          <span className="text-sm text-ink-700">I've read the terms and I'll bring it back.</span>
        </label>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" size="lg" full loading={busy} disabled={!accepted}>
          Hold this unit for me
        </Button>
      </form>
    </PhoneShell>
  );
}
