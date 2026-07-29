import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { Alert, Button, Card, Choice, Field, Input, Loading, PhoneShell, TopBar } from '../ui';
import type { BuyingIntent, GuestUser, LeadProfile, Policy, Product, Store, Unit } from '../types';

interface UnitResponse {
  unit: Unit;
  product: Product;
  store: Store;
  policy: Policy;
}

const CHILD_AGES = [
  { value: '6', label: 'Under 1' },
  { value: '18', label: '1 – 2 years' },
  { value: '30', label: '2 – 3 years' },
  { value: '42', label: '3+ years' },
];

const STROLLER_NEEDS = [
  { value: 'toddler', label: 'Toddler tires easily' },
  { value: 'infant', label: 'Infant, needs to lie flat' },
  { value: 'twins', label: 'Two little ones' },
  { value: 'special_needs_child', label: 'Additional support needs' },
];

const MOBILITY_NEEDS = [
  { value: 'elderly_parent', label: 'Elderly parent or relative' },
  { value: 'post_surgery', label: 'Recovering from surgery' },
  { value: 'injury_recovery', label: 'Injury or fracture' },
  { value: 'chronic_pain', label: 'Ongoing pain or fatigue' },
  { value: 'permanent_mobility_aid', label: 'Everyday mobility aid' },
];

const INTENTS: { value: BuyingIntent; label: string; sublabel: string }[] = [
  { value: 'just_borrowing', label: 'Just today', sublabel: 'Only need it for this visit' },
  { value: 'curious', label: 'Curious', sublabel: 'Might look into one' },
  { value: 'considering', label: 'Considering', sublabel: 'Actively comparing options' },
  { value: 'ready_to_buy', label: 'Ready to buy', sublabel: 'Show me pricing today' },
];

/**
 * The exchange. Yulu takes a payment here; we take the details that make this person
 * reachable, and the context that makes the follow-up worth having.
 */
export default function Profile() {
  const [params] = useSearchParams();
  const unitId = params.get('unit');
  const navigate = useNavigate();
  const { user, profile, token, setUser, setProfile } = useGuest();

  const [context, setContext] = useState<UnitResponse | null>(null);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [need, setNeed] = useState<string | null>(profile?.needType ?? null);
  const [childAge, setChildAge] = useState<string | null>(
    profile?.childAgeMonths ? String(profile.childAgeMonths) : null,
  );
  const [intent, setIntent] = useState<BuyingIntent | null>(profile?.buyingIntent ?? null);
  const [whatsapp, setWhatsapp] = useState(user?.whatsappOptIn ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) navigate(`/verify${unitId ? `?unit=${unitId}` : ''}`, { replace: true });
  }, [token, unitId, navigate]);

  useEffect(() => {
    if (unitId) api.get<UnitResponse>(`/units/${unitId}`).then(setContext).catch(() => setContext(null));
  }, [unitId]);

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user]);

  if (unitId && !context) {
    return (
      <PhoneShell>
        <Loading />
      </PhoneShell>
    );
  }

  const isStroller = context?.product.category !== 'wheelchair';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.patch<{ user: GuestUser; profile: LeadProfile }>(
        '/me/profile',
        {
          name: name.trim(),
          email: email.trim() || undefined,
          city: context?.store.mall?.city,
          whatsappOptIn: whatsapp,
          primaryInterest: context?.product.category,
          needType: need ?? undefined,
          childAgeMonths: isStroller && childAge ? Number(childAge) : null,
          mobilityNeed: !isStroller && need ? need : undefined,
          buyingIntent: intent ?? undefined,
        },
        token,
      );
      setUser(data.user);
      setProfile(data.profile);
      navigate(unitId ? `/confirm?unit=${unitId}` : '/me');
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <TopBar
        title="Almost yours"
        subtitle="Two questions, then pick it up"
        back={unitId ? `/s/${context?.unit.qrToken ?? ''}` : '/'}
      />

      <form onSubmit={submit} className="space-y-5 p-5 rise">
        <Card className="bg-brand-50 p-4 ring-brand-300/40">
          <p className="text-sm font-semibold text-sky-700">
            {context ? context.product.name : 'Your Frido borrow'} · ₹0
          </p>
          <p className="mt-0.5 text-xs text-sky-700">
            We ask this so the store team knows who has the unit, and so we only follow up
            with something actually useful to you.
          </p>
        </Card>

        <Field label="Your name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
            autoComplete="name"
            required
            minLength={2}
          />
        </Field>

        <Field label="Email" hint="Optional — for the receipt and your offer code">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>

        <Field label={isStroller ? "Who's riding?" : "Who's it for?"} required group>
          <Choice
            columns={1}
            options={isStroller ? STROLLER_NEEDS : MOBILITY_NEEDS}
            value={need}
            onChange={setNeed}
          />
        </Field>

        {isStroller && (
          <Field label="How old are they?" required group>
            <Choice options={CHILD_AGES} value={childAge} onChange={setChildAge} />
          </Field>
        )}

        <Field
          label="Thinking of owning one?"
          hint="Straight answer is fine — 'just today' means we won't chase you."
          group
        >
          <Choice columns={1} options={INTENTS} value={intent} onChange={setIntent} />
        </Field>

        <label className="flex items-start gap-3 rounded-xl bg-white p-3.5 ring-1 ring-ink-200">
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(event) => setWhatsapp(event.target.checked)}
            className="mt-0.5 size-5 rounded accent-[var(--color-ink-900)]"
          />
          <span className="text-sm text-ink-700">
            Send my return reminder and offer code on WhatsApp
            <span className="mt-0.5 block text-xs text-ink-400">
              Also lets us share care tips for the product you tried. Opt out any time.
            </span>
          </span>
        </label>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" size="lg" full loading={busy} disabled={!name.trim() || !need}>
          Continue
        </Button>
      </form>
    </PhoneShell>
  );
}
