import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { useStaff } from '../../state';
import { Alert, Button, Card, Loading, Pill, cx } from '../../ui';
import type { FleetUnit, UnitStatus } from '../../types';

const STATUS_TONE: Record<UnitStatus, 'green' | 'amber' | 'brand' | 'red' | 'slate'> = {
  available: 'green',
  reserved: 'amber',
  in_use: 'brand',
  maintenance: 'red',
  retired: 'slate',
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: 'On the shelf',
  reserved: 'Held for pickup',
  in_use: 'Out on the floor',
  maintenance: 'Needs attention',
  retired: 'Retired',
};

export default function Fleet() {
  const { token } = useStaff();
  const [units, setUnits] = useState<FleetUnit[] | null>(null);
  const [filter, setFilter] = useState<UnitStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<FleetUnit | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ units: FleetUnit[] }>('/staff/units', token);
      setUnits(data.units);
    } catch (cause) {
      setError((cause as ApiError).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(unit: FleetUnit, status: UnitStatus) {
    setBusy(unit.id);
    setError(null);
    try {
      await api.patch(`/staff/units/${unit.id}`, { status }, token);
      await load();
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!units) return error ? <Alert>{error}</Alert> : <Loading />;

  const shown = filter === 'all' ? units : units.filter((unit) => unit.status === filter);
  const counts = units.reduce<Record<string, number>>(
    (acc, unit) => ({ ...acc, [unit.status]: (acc[unit.status] ?? 0) + 1 }),
    {},
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(['all', 'available', 'in_use', 'reserved', 'maintenance'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition',
              filter === key
                ? 'bg-ink-900 text-white ring-ink-900'
                : 'bg-white text-ink-500 ring-ink-200 hover:text-ink-900',
            )}
          >
            {key === 'all' ? `All ${units.length}` : `${STATUS_LABEL[key]} ${counts[key] ?? 0}`}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((unit) => (
          <Card key={unit.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-ink-900">{unit.code}</p>
                <p className="truncate text-xs text-ink-400">{unit.product?.name}</p>
              </div>
              <Pill tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</Pill>
            </div>

            <p className="mt-2 text-xs text-ink-400">
              {unit.store?.mall?.name} · {unit.lifetimeSessions} borrows to date
            </p>
            {unit.conditionNote && (
              <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                {unit.conditionNote}
              </p>
            )}
            {unit.currentSession && (
              <p className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-500">
                With {unit.currentSession.guest?.name ?? 'a guest'} · +91{' '}
                {unit.currentSession.guest?.phone}
              </p>
            )}

            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              <Button size="sm" variant="secondary" onClick={() => setQrFor(unit)}>
                QR sticker
              </Button>
              {unit.status === 'available' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === unit.id}
                  onClick={() => setStatus(unit, 'maintenance')}
                >
                  Pull for service
                </Button>
              )}
              {unit.status === 'maintenance' && (
                <Button
                  size="sm"
                  loading={busy === unit.id}
                  onClick={() => setStatus(unit, 'available')}
                >
                  Back on the shelf
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {qrFor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-5"
          role="dialog"
          aria-modal="true"
          onClick={() => setQrFor(null)}
        >
          <Card className="w-full max-w-sm p-6 text-center" >
            <div onClick={(event) => event.stopPropagation()}>
              <h2 className="text-base font-bold text-ink-900">{qrFor.code}</h2>
              <p className="mt-1 text-xs text-ink-400">{qrFor.product?.name}</p>
              <img
                src={`/api/staff/units/${qrFor.id}/qr.svg?t=${token}`}
                alt={`QR code for unit ${qrFor.code}`}
                className="mx-auto mt-4 size-56"
              />
              <p className="mt-3 text-xs text-ink-400">
                Print and stick this on the unit. Scanning it opens the borrow flow for this exact
                stroller or wheelchair.
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" full onClick={() => window.print()}>
                  Print
                </Button>
                <Button full onClick={() => setQrFor(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
