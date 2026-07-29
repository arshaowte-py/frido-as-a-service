import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useGuest } from '../state';
import { Button, Card, Loading, Logo, Pill, ProductArt } from '../ui';
import type { Mall, Product, Store, StoreAvailability } from '../types';

interface MallsResponse {
  malls: (Mall & { stores: Store[] })[];
}

/**
 * Not part of the guest journey — in the real world people arrive by scanning a sticker.
 * This is the demo front door: it explains the model and drops you into a real scan.
 */
export default function Home() {
  const navigate = useNavigate();
  const { activeSession } = useGuest();
  const [malls, setMalls] = useState<MallsResponse['malls']>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<MallsResponse>('/malls'),
      api.get<{ products: Product[] }>('/products'),
    ])
      .then(([mallData, productData]) => {
        setMalls(mallData.malls);
        setProducts(productData.products);
      })
      .finally(() => setLoading(false));
  }, []);

  // Stands in for pointing a phone camera at the sticker on a real unit.
  async function simulateScan(storeId: string) {
    setLaunching(storeId);
    try {
      const data = await api.get<StoreAvailability>(`/stores/${storeId}/availability`);
      const unit = data.products.flatMap((group) => group.units)[0];
      navigate(unit ? `/s/${unit.qrToken}` : `/store/${storeId}`);
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="min-h-full bg-ink-50">
      <header className="border-b border-ink-200/70 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            to="/staff/login"
            className="text-sm font-semibold text-ink-500 hover:text-brand-600"
          >
            Store team →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="py-12 md:py-16">
          <Pill tone="brand">Prototype</Pill>
          <h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-ink-900 md:text-5xl">
            A stroller or wheelchair, free, for as long as you're in the mall.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-500 md:text-lg">
            Scan the sticker on any Frido unit, verify your number, tell us who it's for — and
            walk away with it. Bring it back to the Frido store on your way out. No rental fee.
            The trade is your details, and a reason to visit the store twice.
          </p>

          {activeSession && (
            <Card className="mt-6 flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold text-ink-900">You have a unit out right now</p>
                <p className="text-xs text-ink-400">{activeSession.unit?.product?.name}</p>
              </div>
              <Button onClick={() => navigate(`/session/${activeSession.id}`)}>Resume</Button>
            </Card>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <Card key={product.id} className="flex gap-4 p-4">
                <ProductArt category={product.category} className="h-24 w-28 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-ink-900">{product.name}</h2>
                  <p className="mt-1 text-xs text-ink-500">{product.tagline}</p>
                  <p className="mt-2 text-xs font-semibold text-brand-600">
                    Free in-mall · ₹{product.price?.toLocaleString('en-IN')} to own
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Scan',
              body: 'Every unit carries a QR sticker. It opens straight to that exact stroller or wheelchair — no app install.',
            },
            {
              step: '02',
              title: 'Verify and tell us who it’s for',
              body: 'Mobile OTP, then a few questions. This is where a mall visitor becomes a named lead with a real need.',
            },
            {
              step: '03',
              title: 'Stroll, return, get an offer',
              body: 'Two free hours, extendable. Return it at the store counter and a mall-only discount lands on the screen.',
            },
          ].map((item) => (
            <Card key={item.step} className="p-5">
              <span className="text-xs font-black tracking-widest text-brand-300">{item.step}</span>
              <h3 className="mt-2 text-base font-bold text-ink-900">{item.title}</h3>
              <p className="mt-1.5 text-sm text-ink-500">{item.body}</p>
            </Card>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="text-lg font-bold text-ink-900">Pick a mall to try it</h2>
          <p className="mt-1 text-sm text-ink-500">
            Twelve Frido stores sit inside malls today. Choosing one below acts as if you'd
            pointed your camera at a sticker on the shop floor.
          </p>

          {loading ? (
            <Loading />
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {malls.flatMap((mall) =>
                mall.stores.map((store) => (
                  <Card key={store.id} className="flex flex-col justify-between p-4">
                    <div>
                      <p className="text-sm font-bold text-ink-900">{mall.name}</p>
                      <p className="text-xs text-ink-400">
                        {mall.city} · {store.floor} {store.unitNo}
                      </p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        loading={launching === store.id}
                        onClick={() => simulateScan(store.id)}
                      >
                        Simulate a scan
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/store/${store.id}`)}>
                        What's free
                      </Button>
                    </div>
                  </Card>
                )),
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
