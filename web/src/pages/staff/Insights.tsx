import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { useStaff } from '../../state';
import { Alert, Card, Loading, cx } from '../../ui';
import type { Analytics } from '../../types';

/*
 * Every chart here compares magnitudes across labelled rows, so each one uses a single
 * brand hue and carries its own value as text. Identity never rests on colour alone,
 * which is also why no categorical palette is needed.
 */

const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card className="p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
    <p className="mt-1 text-3xl font-black text-ink-900">{value}</p>
    {sub && <p className="mt-0.5 text-xs text-ink-400">{sub}</p>}
  </Card>
);

function BarRow({
  label,
  sublabel,
  value,
  max,
  suffix,
  tone = 'brand',
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: 'brand' | 'muted';
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-700">{label}</p>
        {sublabel && <p className="truncate text-xs text-ink-400">{sublabel}</p>}
      </div>
      <div className="h-2.5 rounded-full bg-ink-100">
        <div
          className={cx('h-full rounded-full', tone === 'brand' ? 'bg-brand-600' : 'bg-ink-400')}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="tnum w-16 text-right text-sm font-bold text-ink-900">
        {value.toLocaleString('en-IN')}
        {suffix}
      </span>
    </div>
  );
}

/** Sessions per day. One series, so the heading names it and no legend is needed. */
function DailyChart({ daily }: { daily: Analytics['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((day) => day.sessions));

  if (daily.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-400">No sessions in this window.</p>;
  }

  return (
    <div className="relative">
      <div className="flex h-40 items-end gap-[2px]">
        {daily.map((day, index) => (
          <button
            key={day.day}
            type="button"
            aria-label={`${day.day}: ${day.sessions} sessions`}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            className="group relative flex h-full flex-1 items-end"
          >
            <span
              className={cx(
                'w-full rounded-t transition-colors',
                hover === index ? 'bg-brand-700' : 'bg-brand-600',
              )}
              style={{ height: `${Math.max((day.sessions / max) * 100, 3)}%` }}
            />
          </button>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-xs text-ink-400">
        <span>{new Date(daily[0].day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <span>
          {new Date(daily[daily.length - 1].day).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>

      {hover !== null && (
        <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
          {new Date(daily[hover].day).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {daily[hover].sessions} borrowed · {daily[hover].completed} returned
        </div>
      )}
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  demo_booked: 'Demo booked',
  won: 'Bought',
  lost: 'Not now',
};

const INTENT_LABEL: Record<string, string> = {
  just_borrowing: 'Just borrowing',
  curious: 'Curious',
  considering: 'Considering',
  ready_to_buy: 'Ready to buy',
  unknown: 'Not asked',
};

export default function Insights() {
  const { token } = useStaff();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Analytics>(`/staff/analytics?days=${days}`, token)
      .then(setData)
      .catch((cause: ApiError) => setError(cause.message));
  }, [token, days]);

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;

  const scans = data.funnel[0]?.value ?? 0;
  const started = data.funnel.find((step) => step.key === 'started')?.value ?? 0;
  const redeemed = data.funnel.find((step) => step.key === 'redeemed')?.value ?? 0;
  const leads = data.funnel.find((step) => step.key === 'leads')?.value ?? 0;
  const funnelMax = Math.max(1, ...data.funnel.map((step) => step.value));
  const storeMax = Math.max(1, ...data.byStore.map((store) => store.sessions));
  const pipelineMax = Math.max(1, ...data.pipeline.map((stage) => stage.count));
  const intentMax = Math.max(1, ...data.intent.map((item) => item.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-ink-900">Insights</h1>
        <div className="ml-auto flex gap-2">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              onClick={() => setDays(option)}
              className={cx(
                'rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition',
                days === option
                  ? 'bg-ink-900 text-white ring-ink-900'
                  : 'bg-white text-ink-500 ring-ink-200 hover:text-ink-900',
              )}
            >
              {option} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Leads captured" value={leads.toLocaleString('en-IN')} sub={`in ${days} days`} />
        <Tile
          label="Scan → borrow"
          value={scans > 0 ? `${Math.round((started / scans) * 100)}%` : '—'}
          sub={`${started.toLocaleString('en-IN')} handovers from ${scans.toLocaleString('en-IN')} scans`}
        />
        <Tile
          label="Avg time out"
          value={data.avgSessionMinutes ? `${Math.floor(data.avgSessionMinutes / 60)}h ${data.avgSessionMinutes % 60}m` : '—'}
        />
        <Tile
          label="Offers redeemed"
          value={redeemed.toLocaleString('en-IN')}
          sub={started > 0 ? `${Math.round((redeemed / started) * 100)}% of borrows` : undefined}
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink-900">From sticker to sale</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Each step as a share of the one above it — where people drop off.
        </p>
        <div className="mt-4">
          {data.funnel.map((step, index) => {
            const previous = index === 0 ? null : data.funnel[index - 1].value;
            const rate = previous && previous > 0 ? Math.round((step.value / previous) * 100) : null;
            return (
              <BarRow
                key={step.key}
                label={step.label}
                sublabel={rate === null ? undefined : `${rate}% of previous step`}
                value={step.value}
                max={funnelMax}
              />
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink-900">Units borrowed per day</h2>
        <p className="mt-0.5 text-xs text-ink-400">Hover a bar for the exact day.</p>
        <div className="mt-4">
          <DailyChart daily={data.daily} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink-900">Stores by borrows</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Borrows per unit tells you where to add fleet, and where it's sitting idle.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="pb-2 font-semibold">Store</th>
                <th className="pb-2 font-semibold">Borrows</th>
                <th className="pb-2 text-right font-semibold">Guests</th>
                <th className="pb-2 text-right font-semibold">Units</th>
                <th className="pb-2 text-right font-semibold">Per unit</th>
                <th className="pb-2 text-right font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.byStore.map((store) => (
                <tr key={store.storeId} className="border-b border-ink-100 last:border-0">
                  <td className="py-2.5 pr-4">
                    <p className="font-medium text-ink-900">{store.mallName}</p>
                    <p className="text-xs text-ink-400">{store.city}</p>
                  </td>
                  <td className="w-1/3 py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-brand-600"
                          style={{ width: `${Math.max((store.sessions / storeMax) * 100, store.sessions > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <span className="tnum w-8 text-right font-bold text-ink-900">
                        {store.sessions}
                      </span>
                    </div>
                  </td>
                  <td className="tnum py-2.5 text-right text-ink-500">{store.guests}</td>
                  <td className="tnum py-2.5 text-right text-ink-500">{store.unitCount}</td>
                  <td className="tnum py-2.5 text-right font-semibold text-ink-900">
                    {store.sessionsPerUnit}
                  </td>
                  <td className="tnum py-2.5 text-right text-ink-500">
                    {store.avgRating ? `${store.avgRating}★` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-ink-900">By product</h2>
          <div className="mt-3">
            {data.byProduct.map((product) => (
              <BarRow
                key={product.name}
                label={product.category === 'wheelchair' ? 'Wheelchair' : 'Stroller'}
                sublabel={product.avgRating ? `${product.avgRating}★ average` : undefined}
                value={product.sessions}
                max={Math.max(1, ...data.byProduct.map((item) => item.sessions))}
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-ink-900">Stated intent</h2>
          <p className="mt-0.5 text-xs text-ink-400">What guests told us at pickup or return.</p>
          <div className="mt-3">
            {data.intent
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((item) => (
                <BarRow
                  key={item.intent}
                  label={INTENT_LABEL[item.intent] ?? item.intent}
                  value={item.count}
                  max={intentMax}
                  tone={item.intent === 'ready_to_buy' ? 'brand' : 'muted'}
                />
              ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-ink-900">Follow-up pipeline</h2>
          <p className="mt-0.5 text-xs text-ink-400">Across every lead, not just this window.</p>
          <div className="mt-3">
            {data.pipeline
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((stage) => (
                <BarRow
                  key={stage.status}
                  label={STAGE_LABEL[stage.status] ?? stage.status}
                  value={stage.count}
                  max={pipelineMax}
                  tone={stage.status === 'won' ? 'brand' : 'muted'}
                />
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
