import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Alert, Button, Card, Loading, Pill, PhoneShell, ProductArt, TopBar } from '../ui';
import type { StoreAvailability as Availability } from '../types';

/** The standee QR at the shop front: whatever is on the shelf right now. */
export default function StoreAvailability() {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Availability>(`/stores/${storeId}/availability`)
      .then(setData)
      .catch((cause: ApiError) => setError(cause.message));
  }, [storeId]);

  if (error) {
    return (
      <PhoneShell>
        <TopBar title="Store not found" back="/" />
        <div className="p-5">
          <Alert>{error}</Alert>
        </div>
      </PhoneShell>
    );
  }
  if (!data) {
    return (
      <PhoneShell>
        <Loading />
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <TopBar
        title={data.store.mall?.name ?? data.store.name}
        subtitle={`${data.store.floor ?? ''} ${data.store.unitNo ?? ''} · free to borrow`}
        back="/"
      />
      <div className="space-y-4 p-5 rise">
        {data.products.map(({ product, availableCount, units }) => (
          <Card key={product.id} className="overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <ProductArt category={product.category} className="h-20 w-24 shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-ink-900">{product.name}</h2>
                <p className="mt-1 text-xs text-ink-400">{product.tagline}</p>
                <Pill tone={availableCount > 0 ? 'green' : 'red'} className="mt-2">
                  {availableCount > 0 ? `${availableCount} free now` : 'All out right now'}
                </Pill>
              </div>
            </div>
            {units.length > 0 && (
              <div className="border-t border-ink-200/70 p-3">
                <Button full onClick={() => navigate(`/s/${units[0].qrToken}`)}>
                  Take one — free
                </Button>
                {units.length > 1 && (
                  <p className="mt-2 text-center text-xs text-ink-400">
                    We'll give you unit {units[0].code}
                  </p>
                )}
              </div>
            )}
          </Card>
        ))}

        <p className="px-1 text-xs text-ink-400">
          Free for {Math.round(data.policy.freeMinutes / 60)} hours inside the mall. Any photo ID
          stays at the counter until you bring it back.
        </p>
      </div>
    </PhoneShell>
  );
}
