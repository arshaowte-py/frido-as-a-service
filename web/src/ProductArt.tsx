import type { Category } from './types';
import { cx } from './ui';

/**
 * Product artwork.
 *
 * These are hand-drawn vectors modelled on the real Frido products (charcoal + champagne
 * Autofold stroller; black Prime electric wheelchair). They stand in for photography —
 * myfrido.com blocks automated fetches, so the actual PDP shots could not be pulled in.
 *
 * To drop in the real photos — the intended final state:
 *   1. save them in web/public/images/ (e.g. autofold-stroller.png, prime-wheelchair.png)
 *   2. set `image_url` on each product in server/src/seed.js to that path
 *   3. nothing else changes — <ProductArt> renders `src` whenever a product carries one,
 *      and only falls back to the drawing when it does not.
 *
 * Material colours below are literal product colours, not brand tokens, so the drawing
 * reads as the real object. The tile backdrop uses brand tokens.
 */

const FRAME = '#c9a36a'; // champagne / rose-gold stroller frame
const CHARCOAL = '#2b2f36'; // seat + canopy fabric
const TYRE = '#1b1f24';
const STEEL = '#3a4048'; // wheelchair frame

interface Props {
  category: Category;
  /** Real photograph, when the product has one. Falls back to the illustration. */
  src?: string | null;
  alt?: string;
  className?: string;
  /** 'tile' draws the backdrop and ground shadow; 'plain' is the bare object. */
  variant?: 'tile' | 'plain';
}

export function ProductArt({ category, src, alt, className, variant = 'tile' }: Props) {
  const label = alt ?? (category === 'wheelchair' ? 'Frido electric wheelchair' : 'Frido travel stroller');

  if (src) {
    return <img src={src} alt={label} className={cx('object-contain', className)} loading="lazy" />;
  }

  const withBackdrop = variant === 'tile';
  const gradientId = `art-bg-${category}`;

  return (
    <svg viewBox="0 0 240 200" className={className} role="img" aria-label={label}>
      {withBackdrop && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-ink-50)" />
              <stop offset="100%" stopColor="var(--color-brand-50)" />
            </linearGradient>
          </defs>
          <rect width="240" height="200" rx="20" fill={`url(#${gradientId})`} />
          <ellipse cx="122" cy="178" rx="82" ry="9" fill="var(--color-ink-900)" opacity="0.06" />
        </>
      )}
      {category === 'wheelchair' ? <Wheelchair /> : <Stroller />}
    </svg>
  );
}

/** Frido Autofold: dark canopy + seat on a champagne frame, twin front wheels. */
function Stroller() {
  const s = {
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g {...s}>
      {/* champagne frame */}
      <g stroke={FRAME} strokeWidth="7">
        <path d="M70 96 52 60" /> {/* push handle */}
        <path d="M70 96h72" /> {/* seat rail */}
        <path d="M142 96 168 60" /> {/* front upright to canopy */}
        <path d="M78 98 66 158" /> {/* rear leg */}
        <path d="M150 96 150 150" /> {/* front leg */}
        <path d="M92 150h60" /> {/* lower cross brace */}
      </g>

      {/* dark reclined seat + canopy */}
      <path d="M74 96c0-30 16-52 44-52 12 0 22 4 30 12l-20 40z" fill={CHARCOAL} />
      <path d="M74 98h64l-8 34H92z" fill={CHARCOAL} />
      <path d="M84 60c8-8 18-12 30-11" stroke="#ffffff" strokeWidth="3" opacity="0.25" />

      {/* Frido-yellow canopy trim */}
      <path d="M77 84c2-18 12-31 28-35" stroke="var(--color-brand-500)" strokeWidth="4" />

      {/* handle grip */}
      <path d="M46 56h14" stroke={CHARCOAL} strokeWidth="8" />

      {/* wheels: twin front + rear, gold hubs */}
      <circle cx="63" cy="164" r="15" fill={TYRE} />
      <circle cx="63" cy="164" r="5" fill={FRAME} stroke="none" />
      <circle cx="150" cy="160" r="16" fill={TYRE} />
      <circle cx="150" cy="160" r="5.5" fill={FRAME} stroke="none" />
      <circle cx="172" cy="162" r="12" fill={TYRE} />
      <circle cx="172" cy="162" r="4" fill={FRAME} stroke="none" />
    </g>
  );
}

/** Frido Prime: black electric wheelchair, joystick on the armrest, big drive wheel. */
function Wheelchair() {
  const s = {
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g {...s}>
      {/* seat + backrest cushions */}
      <path d="M78 52h30v58H78z" fill={CHARCOAL} />
      <path d="M78 104h64v14H78z" fill={CHARCOAL} />
      <path d="M82 56h22v50H82z" fill="#000000" opacity="0.35" />

      {/* steel frame */}
      <g stroke={STEEL} strokeWidth="6">
        <path d="M74 52v66" />
        <path d="M74 118h70" />
        <path d="M100 86h44" /> {/* armrest */}
        <path d="M144 86v-9" />
        <path d="M144 118l22 16" /> {/* to footplate */}
      </g>

      {/* armrest pad + joystick */}
      <path d="M100 84h44" stroke={CHARCOAL} strokeWidth="9" />
      <circle cx="146" cy="72" r="6" fill="var(--color-brand-500)" stroke={TYRE} strokeWidth="3" />
      <path d="M146 78v6" stroke={TYRE} strokeWidth="4" />

      {/* battery box under seat */}
      <rect x="92" y="120" width="48" height="20" rx="4" fill={STEEL} />

      {/* footplate */}
      <path d="M160 132l18 6" stroke={STEEL} strokeWidth="6" />

      {/* Frido-yellow frame flash */}
      <path d="M96 140h34" stroke="var(--color-brand-500)" strokeWidth="4" />

      {/* rear drive wheel with spokes */}
      <circle cx="96" cy="150" r="27" fill={TYRE} />
      <circle cx="96" cy="150" r="12" fill={STEEL} stroke="none" />
      <circle cx="96" cy="150" r="4" fill={TYRE} stroke="none" />
      <g stroke={STEEL} strokeWidth="3" opacity="0.9">
        <path d="M96 124v14" />
        <path d="M96 162v14" />
        <path d="M72 150h12" />
        <path d="M108 150h12" />
      </g>

      {/* front caster */}
      <circle cx="178" cy="156" r="12" fill={TYRE} />
      <circle cx="178" cy="156" r="4" fill={STEEL} stroke="none" />
      <path d="M178 144v-8" stroke={STEEL} strokeWidth="5" />
    </g>
  );
}

export default ProductArt;
