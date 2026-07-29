import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { useStaff } from '../../state';
import { Alert, Button, Card, Input, Loading, Pill } from '../../ui';
import type { LiveSession, Overview as OverviewData } from '../../types';

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: string }) => (
  <Card className="p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
    <p className={`mt-1 text-3xl font-black ${tone ?? 'text-ink-900'}`}>{value}</p>
  </Card>
);

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';

/** The screen a store associate keeps open on the counter tablet. */
export default function Overview() {
  const { token } = useStaff();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoverFor, setHandoverFor] = useState<string | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<OverviewData>('/staff/overview', token));
    } catch (cause) {
      setError((cause as ApiError).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [load]);

  async function handover(session: LiveSession) {
    setBusy(session.id);
    setError(null);
    try {
      await api.post(`/staff/sessions/${session.id}/handover`, { unlockCode }, token);
      setHandoverFor(null);
      setUnlockCode('');
      await load();
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function receive(session: LiveSession, condition: 'good' | 'damaged') {
    setBusy(session.id);
    setError(null);
    try {
      await api.post(`/staff/sessions/${session.id}/receive`, { condition }, token);
      await load();
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Out now" value={data.fleet.inUse} />
        <Stat label="Available" value={data.fleet.available} tone="text-brand-600" />
        <Stat
          label="Overdue"
          value={data.overdueCount}
          tone={data.overdueCount > 0 ? 'text-red-600' : 'text-ink-900'}
        />
        <Stat label="Awaiting pickup" value={data.awaitingHandover} />
        <Stat label="Sessions today" value={data.today.sessions} />
        <Stat label="New leads today" value={data.today.newLeads} tone="text-brand-600" />
      </div>

      {error && <Alert>{error}</Alert>}

      <section>
        <h2 className="mb-3 text-sm font-bold text-ink-900">
          On the floor right now ({data.live.length})
        </h2>

        {data.live.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-400">
            Nothing out at the moment. Every unit is on the shelf.
          </Card>
        ) : (
          <div className="space-y-2">
            {data.live.map((session) => (
              <Card key={session.id} className="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-52 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink-900">
                        {session.unit?.code}
                      </span>
                      {session.status === 'pending' ? (
                        <Pill tone="amber">Awaiting pickup</Pill>
                      ) : session.isOverdue ? (
                        <Pill tone="red">
                          Overdue {Math.abs(session.minutesRemaining ?? 0)} min
                        </Pill>
                      ) : (
                        <Pill tone="green">{session.minutesRemaining} min left</Pill>
                      )}
                      {session.extensions > 0 && <Pill>extended {session.extensions}×</Pill>}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-700">
                      {session.guest?.name ?? 'Unnamed guest'} · +91 {session.guest?.phone}
                    </p>
                    <p className="text-xs text-ink-400">
                      {session.unit?.product?.name}
                      {session.purpose ? ` · ${session.purpose}` : ''} · due {clock(session.dueAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {session.status === 'pending' ? (
                      handoverFor === session.id ? (
                        <>
                          <Input
                            autoFocus
                            value={unlockCode}
                            onChange={(event) => setUnlockCode(event.target.value.toUpperCase())}
                            placeholder="Code"
                            maxLength={4}
                            className="w-28 text-center font-mono font-bold uppercase"
                          />
                          <Button
                            size="sm"
                            loading={busy === session.id}
                            onClick={() => handover(session)}
                          >
                            Hand over
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setHandoverFor(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setHandoverFor(session.id);
                            setUnlockCode('');
                          }}
                        >
                          Verify code &amp; hand over
                        </Button>
                      )
                    ) : (
                      <>
                        <Button
                          size="sm"
                          loading={busy === session.id}
                          onClick={() => receive(session, 'good')}
                        >
                          Receive back
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => receive(session, 'damaged')}
                        >
                          Return damaged
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
