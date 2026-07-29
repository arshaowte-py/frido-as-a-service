import type { Category } from './types';
import { cx } from './ui';

/**
 * Product artwork.
 *
 * These are hand-drawn vectors standing in for real photography — myfrido.com blocks
 * automated fetches, so the shots could not be pulled in. To swap in the real ones:
 *
 *   1. drop the files in web/public/images/ (e.g. stroller.jpg, wheelchair.jpg)
 *   2. set `image_url` on each product in server/src/seed.js to '/images/stroller.jpg'
 *   3. nothing else changes — <ProductArt> renders `src` when a product carries one
 *
 * Drawn side-on, facing right, on a soft backdrop so a card reads as a product tile
 * rather than an icon.
 */

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
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? (category === 'wheelchair' ? 'Electric wheelchair' : 'Travel stroller')}
        className={cx('object-contain', className)}
        loading="lazy"
      />
    );
  }

  const withBackdrop = variant === 'tile';
  const label = alt ?? (category === 'wheelchair' ? 'Frido electric wheelchair' : 'Frido travel stroller');
  const gradientId = `art-bg-${category}`;

  return (
    <svg viewBox="0 0 240 200" className={className} role="img" aria-label={label}>
      {withBackdrop && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-50)" />
              <stop offset="100%" stopColor="var(--color-brand-100)" />
            </linearGradient>
          </defs>
          <rect width="240" height="200" rx="20" fill={`url(#${gradientId})`} />
          <ellipse cx="122" cy="176" rx="78" ry="9" fill="var(--color-brand-300)" opacity="0.45" />
        </>
      )}

      <g
        fill="none"
        stroke="var(--color-brand-700)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {category === 'wheelchair' ? <WheelchairPaths /> : <StrollerPaths />}
      </g>
    </svg>
  );
}

/** Travel stroller: reclined seat, folding hood, four wheels, under-basket. */
function StrollerPaths() {
  return (
    <>
      {/* hood */}
      <path
        d="M64 92c0-26 15-44 38-44 9 0 17 3 23 8l-14 36z"
        fill="var(--color-brand-500)"
        stroke="var(--color-brand-700)"
      />
      <path d="M74 70c8-9 18-13 29-12" strokeWidth="4" opacity="0.55" stroke="white" />

      {/* seat back and base */}
      <path d="M64 92h58" />
      <path d="M122 92l16 34H86" fill="var(--color-brand-100)" />

      {/* handle */}
      <path d="M64 92 46 58" />
      <path d="M38 52h18" />

      {/* footrest */}
      <path d="M138 126l22 6" />

      {/* under-basket */}
      <path d="M92 140h44a6 6 0 0 0 0-12H92a6 6 0 0 0 0 12z" fill="var(--color-brand-100)" strokeWidth="5" />

      {/* frame legs */}
      <path d="M86 126 74 158" />
      <path d="M138 126l18 26" />

      {/* wheels */}
      <circle cx="70" cy="160" r="17" fill="white" />
      <circle cx="70" cy="160" r="5" fill="var(--color-brand-700)" stroke="none" />
      <circle cx="160" cy="158" r="12" fill="white" />
      <circle cx="160" cy="158" r="4" fill="var(--color-brand-700)" stroke="none" />
    </>
  );
}

/** Electric wheelchair: driven rear wheel, joystick on the armrest, battery under the seat. */
function WheelchairPaths() {
  return (
    <>
      {/* backrest and seat */}
      <path d="M78 112V56" />
      <path d="M78 56h30" strokeWidth="5" />
      <path d="M78 112h62" />
      <path d="M78 96h58" fill="var(--color-brand-500)" stroke="none" opacity="0.18" />
      <path d="M82 60h24v46H82z" fill="var(--color-brand-500)" stroke="none" opacity="0.9" />

      {/* armrest and joystick */}
      <path d="M100 84h44" strokeWidth="5" />
      <path d="M144 84V74" strokeWidth="5" />
      <circle cx="144" cy="70" r="6" fill="var(--color-accent-500)" stroke="var(--color-brand-700)" strokeWidth="4" />

      {/* battery pack */}
      <path d="M96 118h40a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H96a5 5 0 0 1-5-5v-12a5 5 0 0 1 5-5z" fill="var(--color-brand-100)" strokeWidth="5" />

      {/* footplate */}
      <path d="M140 112l24 14" />
      <path d="M158 130l16 6" strokeWidth="5" />

      {/* rear drive wheel */}
      <circle cx="98" cy="146" r="26" fill="white" />
      <circle cx="98" cy="146" r="9" fill="var(--color-brand-700)" stroke="none" />
      <g strokeWidth="3" opacity="0.55">
        <path d="M98 122v14" />
        <path d="M98 156v14" />
        <path d="M74 146h14" />
        <path d="M108 146h14" />
      </g>

      {/* front caster */}
      <circle cx="176" cy="152" r="12" fill="white" />
      <circle cx="176" cy="152" r="4" fill="var(--color-brand-700)" stroke="none" />
      <path d="M176 140v-8" strokeWidth="5" />
    </>
  );
}

export default ProductArt;
