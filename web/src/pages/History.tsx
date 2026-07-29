import { Link, useNavigate } from 'react-router-dom';
import { useGuest } from '../state';
import { Button, Card, Loading, PhoneShell, Pill, ProductArt, TopBar } from '../ui';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function History() {
  const navigate = useNavigate();
  const { user, sessions, offers, activeSession, loading, signOut } = useGuest();

  if (loading) {
    return (
      <PhoneShell>
        <Loading />
      </PhoneShell>
    );
  }

  if (!user) {
    return (
      <PhoneShell>
        <TopBar title="Your borrows" back="/" />
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-500">Verify your number to see everything you've borrowed.</p>
          <Button full onClick={() => navigate('/verify')}>
            Verify my number
          </Button>
        </div>
      </PhoneShell>
    );
  }

  const liveOffers = offers.filter((offer) => !offer.redeemedAt && !offer.isExpired);

  return (
    <PhoneShell>
      <TopBar
        title={user.name ?? 'Your borrows'}
        subtitle={`+91 ${user.phone}`}
        back="/"
        right={
          <button
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-400 hover:bg-ink-100"
          >
            Sign out
          </button>
        }
      />

      <div className="space-y-5 p-5 rise">
        {activeSession && (
          <Card className="flex items-center justify-between gap-3 bg-brand-50 p-4 ring-brand-300/40">
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-700">Out right now</p>
              <p className="truncate text-xs text-brand-600">
                {activeSession.unit?.product?.name} · {activeSession.unit?.code}
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/session/${activeSession.id}`)}>
              Open
            </Button>
          </Card>
        )}

        {liveOffers.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-ink-900">Your offers</h2>
            <div className="space-y-2">
              {liveOffers.map((offer) => (
                <Card key={offer.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {offer.discountPct}% off {offer.product?.name}
                    </p>
                    <p className="text-xs text-ink-400">
                      Expires {formatDate(offer.expiresAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-accent-100 px-2.5 py-1.5 font-mono text-sm font-bold text-accent-700">
                    {offer.code}
                  </span>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold text-ink-900">History</h2>
          {sessions.length === 0 ? (
            <Card className="p-6 text-center text-sm text-ink-400">
              Nothing yet. Scan a sticker on any Frido unit at the mall.
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <Card key={session.id} className="flex items-center gap-3 p-3.5">
                  {session.unit?.product && (
                    <ProductArt
                      category={session.unit.product.category}
                      className="h-14 w-16 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {session.unit?.product?.name}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {session.store?.mall?.name} · {formatDate(session.createdAt)}
                      {session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}
                    </p>
                  </div>
                  {session.status === 'completed' ? (
                    <Link to={`/session/${session.id}/wrap`}>
                      <Pill tone="green">{session.rating ? `${session.rating}★` : 'Returned'}</Pill>
                    </Link>
                  ) : (
                    <Pill tone={session.status === 'cancelled' ? 'slate' : 'brand'}>
                      {session.status}
                    </Pill>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </PhoneShell>
  );
}
