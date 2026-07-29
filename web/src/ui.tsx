import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------- primitives */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  full?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Frido yellow with near-black text — the signature CTA.
  primary: 'bg-brand-500 text-ink-900 hover:bg-brand-600 focus-visible:outline-brand-600',
  secondary: 'bg-white text-ink-900 ring-1 ring-ink-200 hover:bg-ink-50 focus-visible:outline-ink-400',
  ghost: 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-ink-400',
  danger: 'bg-coral-600 text-white hover:bg-coral-700 focus-visible:outline-coral-600',
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-14 px-6 text-base rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <svg className={cx('size-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  return (
    <Tag className={cx('rounded-2xl bg-white ring-1 ring-ink-200/70 shadow-sm', className)}>
      {children}
    </Tag>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  required?: boolean;
  /**
   * Set when the field holds several controls rather than one — a row of toggle buttons,
   * a star rating. A <label> may only wrap a single labelable control; wrapping a button
   * group in one swallows the buttons' accessible names, so those render as a fieldset.
   */
  group?: boolean;
}

export function Field({ label, hint, error, children, required, group }: FieldProps) {
  const heading = (
    <>
      {label}
      {required && <span className="text-brand-600"> *</span>}
    </>
  );

  if (group) {
    return (
      <fieldset className="block min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-ink-700">{heading}</legend>
        {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
        <div className="mt-1.5">{children}</div>
        {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      </fieldset>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink-700">{heading}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border-0 bg-ink-50 px-3.5 py-3 text-base text-ink-900 ring-1 ring-inset ' +
  'ring-ink-200 outline-none transition placeholder:text-ink-400 focus:bg-white ' +
  'focus:ring-2 focus:ring-sky-500';

export const Input = (props: ComponentPropsWithRef<'input'>) => (
  <input {...props} className={cx(inputClass, props.className)} />
);

export const Textarea = (props: ComponentPropsWithRef<'textarea'>) => (
  <textarea {...props} className={cx(inputClass, 'min-h-24 resize-y', props.className)} />
);

export function Choice<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: T; label: string; sublabel?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={cx('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-xl px-3 py-3 text-left text-sm font-medium ring-1 transition',
              selected
                ? 'bg-brand-50 text-ink-900 ring-2 ring-brand-500'
                : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
            )}
          >
            {option.label}
            {option.sublabel && (
              <span className="mt-0.5 block text-xs font-normal text-ink-400">{option.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-100 text-ink-900',
  amber: 'bg-clay-100 text-clay-700',
  red: 'bg-coral-100 text-coral-700',
  slate: 'bg-ink-100 text-ink-700',
  green: 'bg-mint-100 text-mint-700',
} as const;

export const Pill = ({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
      TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

export function Alert({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <div
      role="alert"
      className={cx(
        'rounded-xl px-3.5 py-3 text-sm font-medium',
        tone === 'red' ? 'bg-coral-50 text-coral-700' : 'bg-clay-100 text-clay-700',
      )}
    >
      {children}
    </div>
  );
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
    <Spinner />
    {label}
  </div>
);

/* --------------------------------------------------------------- guest app shell */

/**
 * The guest journey is a phone experience — someone is standing in a mall holding it.
 * On a laptop we frame it so the prototype still reads as the thing it will be.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-ink-100 md:flex md:items-center md:justify-center md:py-8">
      <div className="mx-auto w-full max-w-md bg-ink-50 md:min-h-[860px] md:rounded-[2.25rem] md:shadow-2xl md:ring-1 md:ring-ink-200">
        {children}
      </div>
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-200/70 bg-white/90 px-4 py-3 backdrop-blur md:rounded-t-[2.25rem]">
      {back && (
        <Link
          to={back}
          aria-label="Go back"
          className="-ml-1 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
            <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-400">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/**
 * Frido wordmark + the "assist" sub-brand. Frido's own logo is the lowercase "frido"
 * set in Gilroy; this echoes it (black wordmark, signature-yellow accent) without
 * reproducing the exact logotype. Drop the real logo SVG in and swap this if wanted.
 * `onDark` flips it for the near-black staff header / footers.
 */
export const Logo = ({ className, onDark = false }: { className?: string; onDark?: boolean }) => (
  <span className={cx('inline-flex items-baseline gap-1', className)}>
    <span className={cx('text-lg font-black lowercase tracking-tight', onDark ? 'text-white' : 'text-ink-900')}>
      frido
    </span>
    <span className="mb-0.5 inline-block size-1.5 self-end rounded-full bg-brand-500" aria-hidden />
    <span className={cx('text-lg font-semibold lowercase tracking-tight', onDark ? 'text-brand-500' : 'text-ink-400')}>
      assist
    </span>
  </span>
);

/* ------------------------------------------------------------------ product art */

export { ProductArt } from './ProductArt';
