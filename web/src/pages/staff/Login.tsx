import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { useStaff } from '../../state';
import { Alert, Button, Card, Field, Input, Logo } from '../../ui';

export default function StaffLogin() {
  const navigate = useNavigate();
  const { signIn, staff } = useStaff();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (staff) navigate('/staff', { replace: true });
  }, [staff, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(phone, pin);
      navigate('/staff', { replace: true });
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-ink-100 p-5">
      <div className="w-full max-w-sm">
        <Logo className="mb-6 justify-center" />
        <Card className="p-6">
          <h1 className="text-lg font-bold text-ink-900">Store team sign-in</h1>
          <p className="mt-1 text-sm text-ink-500">
            Use the mobile number and PIN issued to your store.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Mobile number" required>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                placeholder="9999999999"
                required
              />
            </Field>
            <Field label="PIN" required>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                required
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button type="submit" full size="lg" loading={busy}>
              Sign in
            </Button>
          </form>

          <div className="mt-5 rounded-xl bg-ink-50 p-3 text-xs text-ink-500">
            <p className="font-semibold text-ink-700">Demo logins</p>
            <p className="mt-1">
              <button
                type="button"
                className="font-mono underline"
                onClick={() => {
                  setPhone('9999999999');
                  setPin('4321');
                }}
              >
                9999999999 / 4321
              </button>{' '}
              — HQ, every store
            </p>
            <p className="mt-0.5">
              <button
                type="button"
                className="font-mono underline"
                onClick={() => {
                  setPhone('9001000000');
                  setPin('1234');
                }}
              >
                9001000000 / 1234
              </button>{' '}
              — Phoenix Palladium, Mumbai
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
