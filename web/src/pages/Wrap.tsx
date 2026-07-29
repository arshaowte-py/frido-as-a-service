import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { Alert, Button, Card, Field, Loading, PhoneShell, ProductArt, Textarea, cx } from '../ui';
import type { BorrowSession, BuyingIntent } from '../types';

const INTENTS: { value: BuyingIntent; label: string }[] = [
  { value: 'just_borrowing', label: 'Not right now' },
  { value: 'curious', label: 'Maybe later' },
  { value: 'considering', label: 'Seriously considering' },
  { value: 'ready_to_buy', label: 'Yes — talk to me today' },
];

/**
 * Where the borrow turns into a lead worth calling: a rating, a stated intent, and a
 * discount that only exists because they walked into this mall today.
 */
export default function Wrap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, offers, refresh } = useGuest();

  const [session, setSession] = useState<BorrowSession | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [intent, setIntent] = useState<BuyingIntent | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      navigate('/verify', { replace: true });
      return;
    }
    api
      .get<{ session: BorrowSession }>(`/sessions/${id}`, token)
      .then((data) => {
        setSession(data.session);
        setRating(data.session.rating ?? 0);
        setSubmitted(Boolean(data.session.rating));
      })
      .catch((cause: ApiError) => setError(cause.message));
  }, [id, token, navigate]);

  const offer = offers.find((item) => item.sessionId === id) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/sessions/${id}/feedback`,
        { rating, feedback: comment.trim() || undefined, buyingIntent: intent ?? undefined },
        token,
      );
      await refresh();
      setSubmitted(true);
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
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

  return (
    <PhoneShell>
      <div className="space-y-5 p-5 rise">
        <div className="pt-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-100">
            <svg viewBox="0 0 24 24" className="size-7 text-brand-600" fill="none" aria-hidden>
              <path
                d="m5 13 4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-black text-ink-900">Returned. Thank you.</h1>
          <p className="mt-1 text-sm text-ink-500">
            {session.durationMinutes
              ? `You had it for ${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m.`
              : 'Hope it made the day easier.'}{' '}
            Cost to you: ₹0.
          </p>
        </div>

        {offer && (
          <Card className="overflow-hidden ring-accent-500/30">
            <div className="bg-accent-100 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-accent-700">
                In-mall offer · expires in 7 days
              </p>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-4">
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
                  {product?.price && (
                    <p className="mt-0.5 text-xs text-ink-400">
                      <span className="line-through">₹{product.mrp?.toLocaleString('en-IN')}</span>{' '}
                      ₹{product.price.toLocaleString('en-IN')} — another {offer.discountPct}% off
                      with this code
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-accent-500 bg-accent-100/50 px-4 py-3 text-center">
                <p className="font-mono text-2xl font-black tracking-widest text-accent-700">
                  {offer.code}
                </p>
                <p className="mt-1 text-xs text-accent-700">
                  {offer.redeemedAt ? 'Already used — enjoy it.' : 'Show this at the Frido counter'}
                </p>
              </div>
              {product?.productUrl && (
                <a href={product.productUrl} target="_blank" rel="noreferrer">
                  <Button variant="secondary" full className="mt-3">
                    See the full product page
                  </Button>
                </a>
              )}
            </div>
          </Card>
        )}

        {submitted ? (
          <Card className="p-4 text-center">
            <p className="text-sm font-semibold text-ink-900">Noted — thank you.</p>
            <p className="mt-1 text-xs text-ink-400">
              {intent === 'ready_to_buy' || session.rating === 5
                ? 'Someone from the store will reach out.'
                : 'We only get in touch if there is something genuinely useful.'}
            </p>
          </Card>
        ) : (
          <Card className="space-y-4 p-4">
            <div>
              <p className="text-sm font-bold text-ink-900">How was it?</p>
              <div className="mt-2 flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} star${value > 1 ? 's' : ''}`}
                    onClick={() => setRating(value)}
                    className={cx(
                      'grid h-12 flex-1 place-items-center rounded-xl text-2xl transition',
                      value <= rating ? 'bg-accent-100' : 'bg-ink-50 hover:bg-ink-100',
                    )}
                  >
                    <span className={value <= rating ? 'opacity-100' : 'opacity-25'}>★</span>
                  </button>
                ))}
              </div>
            </div>

            <Field label={`Thinking of owning the ${product?.category ?? 'product'}?`} group>
              <div className="grid gap-2">
                {INTENTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIntent(option.value)}
                    className={cx(
                      'rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 transition',
                      intent === option.value
                        ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500'
                        : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Anything you'd change?" hint="Optional">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="The recline was perfect for a sleeping toddler…"
                maxLength={500}
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button full size="lg" loading={busy} disabled={rating === 0} onClick={submit}>
              Send feedback
            </Button>
          </Card>
        )}

        <div className="flex gap-3 pb-4">
          <Link to="/me" className="flex-1">
            <Button variant="secondary" full>
              My borrows
            </Button>
          </Link>
          <Link to="/" className="flex-1">
            <Button variant="ghost" full>
              Done
            </Button>
          </Link>
        </div>
      </div>
    </PhoneShell>
  );
}
