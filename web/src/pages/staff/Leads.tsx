import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, download } from '../../api';
import { useStaff } from '../../state';
import { Alert, Button, Card, Input, Loading, Pill, Textarea, cx } from '../../ui';
import type { FollowupStatus, Lead } from '../../types';

const STATUSES: { value: FollowupStatus; label: string; tone: 'slate' | 'brand' | 'amber' | 'green' | 'red' }[] = [
  { value: 'new', label: 'New', tone: 'slate' },
  { value: 'contacted', label: 'Contacted', tone: 'brand' },
  { value: 'demo_booked', label: 'Demo booked', tone: 'amber' },
  { value: 'won', label: 'Bought', tone: 'green' },
  { value: 'lost', label: 'Not now', tone: 'red' },
];

const INTENT_LABEL: Record<string, string> = {
  just_borrowing: 'Just borrowing',
  curious: 'Curious',
  considering: 'Considering',
  ready_to_buy: 'Ready to buy',
};

const PAGE = 40;

const readable = (value: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase()) : '—';

/** The reason the free stroller exists: a callable list with context attached. */
export default function Leads() {
  const { token } = useStaff();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [status, setStatus] = useState<FollowupStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (query.trim()) params.set('q', query.trim());
    try {
      const data = await api.get<{ leads: Lead[] }>(`/staff/leads?${params}`, token);
      setLeads(data.leads);
      setVisible(PAGE);
    } catch (cause) {
      setError((cause as ApiError).message);
    }
  }, [token, status, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function update(lead: Lead, patch: Record<string, unknown>) {
    setBusy(lead.user.id);
    setError(null);
    try {
      await api.patch(`/staff/leads/${lead.user.id}`, patch, token);
      await load();
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or number"
          className="w-full max-w-64"
        />
        <div className="flex flex-wrap gap-2">
          {(['all', ...STATUSES.map((item) => item.value)] as const).map((key) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={cx(
                'rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition',
                status === key
                  ? 'bg-ink-900 text-white ring-ink-900'
                  : 'bg-white text-ink-500 ring-ink-200 hover:text-ink-900',
              )}
            >
              {key === 'all' ? 'All' : STATUSES.find((item) => item.value === key)!.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() =>
            token &&
            download('/staff/leads.csv', token, `frido-leads-${new Date().toISOString().slice(0, 10)}.csv`)
          }
        >
          Export CSV
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}
      {!leads ? (
        <Loading />
      ) : leads.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-400">No leads match that filter.</Card>
      ) : (
        <>
          <p className="text-xs text-ink-400">
            {leads.length} {leads.length === 1 ? 'person' : 'people'}
            {leads.length >= 500 && ' (showing the 500 most recent)'}
          </p>
          <div className="space-y-2">
            {leads.slice(0, visible).map((lead) => {
              const open = openId === lead.user.id;
              const statusMeta = STATUSES.find((item) => item.value === lead.followupStatus);
              return (
                <Card key={lead.user.id} className="overflow-hidden">
                  <button
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-ink-50"
                    onClick={() => {
                      setOpenId(open ? null : lead.user.id);
                      setNote(lead.notes ?? '');
                    }}
                  >
                    <div className="min-w-44 flex-1">
                      <p className="text-sm font-bold text-ink-900">
                        {lead.user.name ?? 'Unnamed'}
                      </p>
                      <p className="text-xs text-ink-400">+91 {lead.user.phone}</p>
                    </div>
                    <div className="min-w-36 text-xs text-ink-500">
                      <p>{readable(lead.primaryInterest)}</p>
                      <p className="text-ink-400">
                        {lead.childAgeMonths
                          ? `Child ${lead.childAgeMonths} months`
                          : readable(lead.mobilityNeed ?? lead.needType)}
                      </p>
                    </div>
                    <div className="min-w-28 text-xs text-ink-500">
                      <p>{lead.sessionCount} borrow{lead.sessionCount === 1 ? '' : 's'}</p>
                      {lead.avgRating && <p className="text-ink-400">{lead.avgRating}★ average</p>}
                    </div>
                    {lead.buyingIntent && (
                      <Pill tone={lead.buyingIntent === 'ready_to_buy' ? 'amber' : 'slate'}>
                        {INTENT_LABEL[lead.buyingIntent]}
                      </Pill>
                    )}
                    <Pill tone={statusMeta?.tone ?? 'slate'}>{statusMeta?.label}</Pill>
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-ink-200/70 bg-ink-50 p-4 rise">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ['City', lead.user.city ?? '—'],
                          ['Email', lead.user.email ?? '—'],
                          ['WhatsApp', lead.user.whatsappOptIn ? 'Opted in' : 'No'],
                          [
                            'Last borrow',
                            lead.lastSessionAt
                              ? new Date(lead.lastSessionAt).toLocaleDateString('en-IN')
                              : '—',
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                              {label}
                            </p>
                            <p className="truncate text-sm text-ink-700">{value}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                          Move to
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {STATUSES.map((option) => (
                            <Button
                              key={option.value}
                              size="sm"
                              variant={lead.followupStatus === option.value ? 'primary' : 'secondary'}
                              loading={busy === lead.user.id}
                              onClick={() =>
                                update(lead, { followupStatus: option.value, claim: true })
                              }
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                          Notes
                        </p>
                        <Textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Wanted the navy one. Calling back Saturday."
                          className="bg-white"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            loading={busy === lead.user.id}
                            onClick={() => update(lead, { notes: note })}
                          >
                            Save note
                          </Button>
                          <a href={`tel:+91${lead.user.phone}`}>
                            <Button size="sm" variant="secondary">
                              Call
                            </Button>
                          </a>
                          <a
                            href={`https://wa.me/91${lead.user.phone}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button size="sm" variant="secondary">
                              WhatsApp
                            </Button>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {visible < leads.length && (
            <Button
              variant="secondary"
              full
              onClick={() => setVisible((count) => count + PAGE)}
            >
              Show {Math.min(PAGE, leads.length - visible)} more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
