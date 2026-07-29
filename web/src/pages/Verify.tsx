import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useGuest } from '../state';
import { nextStep } from './Scan';
import { Alert, Button, Card, Field, Input, PhoneShell, TopBar } from '../ui';
import type { BorrowSession, GuestUser, LeadProfile } from '../types';

interface OtpRequestResponse {
  challengeId: string;
  phone: string;
  expiresInSeconds: number;
  devCode?: string;
}
interface VerifyResponse {
  token: string;
  user: GuestUser;
  profile: LeadProfile | null;
  isNew: boolean;
  activeSession: BorrowSession | null;
}

export default function Verify() {
  const [params] = useSearchParams();
  const unitId = params.get('unit');
  const navigate = useNavigate();
  const { signIn } = useGuest();

  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<OtpRequestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (stage === 'code') codeInput.current?.focus();
  }, [stage]);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.post<OtpRequestResponse>('/auth/otp/request', { phone });
      setChallenge(data);
      setSecondsLeft(30);
      setStage('code');
      // While DEV_OTP_ECHO is on the API hands back the code so the flow can be walked
      // through without an SMS gateway. This disappears the moment it's switched off.
      if (data.devCode) setCode(data.devCode);
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const data = await api.post<VerifyResponse>('/auth/otp/verify', {
        challengeId: challenge.challengeId,
        code,
      });
      await signIn(data.token);

      if (data.activeSession) return navigate(`/session/${data.activeSession.id}`, { replace: true });
      if (!unitId) return navigate('/me', { replace: true });
      navigate(nextStep(unitId, { signedIn: true, hasName: Boolean(data.user.name) }), {
        replace: true,
      });
    } catch (cause) {
      setError((cause as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <TopBar
        title={stage === 'phone' ? 'Your mobile number' : 'Enter the code'}
        subtitle={stage === 'phone' ? 'One step before you can take the unit' : `Sent to ${challenge?.phone}`}
        back="/"
      />

      <div className="space-y-5 p-5 rise">
        {stage === 'phone' ? (
          <form onSubmit={requestCode} className="space-y-5">
            <Field
              label="Mobile number"
              hint="We send a one-time code. We never share your number outside Frido."
              required
            >
              <div className="flex items-stretch gap-2">
                <span className="grid shrink-0 place-items-center rounded-xl bg-ink-100 px-3 text-sm font-semibold text-ink-500">
                  +91
                </span>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button type="submit" size="lg" full loading={busy} disabled={phone.length !== 10}>
              Send code
            </Button>

            <p className="text-xs leading-relaxed text-ink-400">
              By continuing you agree to Frido contacting you about this borrow and about the
              products you tried. You can opt out any time by replying STOP.
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-5">
            <Field label="6-digit code" required>
              <Input
                ref={codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl font-bold tracking-[0.5em]"
                required
              />
            </Field>

            {challenge?.devCode && (
              <Card className="bg-clay-100 p-3 text-xs text-clay-700 ring-clay-500/30">
                <strong>Demo mode.</strong> No SMS was sent — the code is{' '}
                <span className="font-mono font-bold">{challenge.devCode}</span> and has been
                filled in for you. Switch <code>DEV_OTP_ECHO</code> off to use a real gateway.
              </Card>
            )}

            {error && <Alert>{error}</Alert>}

            <Button type="submit" size="lg" full loading={busy} disabled={code.length < 4}>
              Verify and continue
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="font-semibold text-ink-500 hover:text-ink-900"
                onClick={() => {
                  setStage('phone');
                  setCode('');
                  setError(null);
                }}
              >
                Change number
              </button>
              <button
                type="button"
                disabled={secondsLeft > 0}
                onClick={() => requestCode()}
                className="font-semibold text-sky-700 disabled:text-ink-400"
              >
                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </PhoneShell>
  );
}
