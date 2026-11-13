import type { Currency } from '@northbook/shared';
import { useId, type ReactNode } from 'react';

const leaf =
  '12,4.5 13.2,7 14.8,6.3 14.3,10 16.3,8.3 16.8,9.6 19,9.3 18.2,11.6 19.2,12.3 15.6,15 16,16.4 12.4,15.9 12.4,19.5 11.6,19.5 11.6,15.9 8,16.4 8.4,15 4.8,12.3 5.8,11.6 5,9.3 7.2,9.6 7.7,8.3 9.7,10 9.2,6.3 10.8,7';
const glyph = (text: string) => (
  <text
    x="12"
    y="16.6"
    textAnchor="middle"
    fontSize="13"
    fontWeight="700"
    fill="#fff"
    fontFamily="var(--font-sans), system-ui, sans-serif"
  >
    {text}
  </text>
);
const stripes = [0, 2, 4, 6, 8, 10, 12];
const stars = [
  [2.6, 2.4],
  [6, 2.4],
  [9.4, 2.4],
  [4.3, 5],
  [7.7, 5],
  [2.6, 7.6],
  [6, 7.6],
  [9.4, 7.6],
  [4.3, 10.2],
  [7.7, 10.2],
] as const;

const artwork: Record<Currency, ReactNode> = {
  BTC: (
    <>
      <rect width="24" height="24" fill="#f7931a" />
      {glyph('₿')}
    </>
  ),
  ETH: (
    <>
      <rect width="24" height="24" fill="#627eea" />
      <path d="M12 4l5 8.2-5 2.9-5-2.9z" fill="#fff" />
      <path d="M12 16.3l5-2.9-5 6.6-5-6.6z" fill="#fff" fillOpacity="0.7" />
    </>
  ),
  USDC: (
    <>
      <rect width="24" height="24" fill="#2775ca" />
      {glyph('$')}
    </>
  ),
  USDT: (
    <>
      <rect width="24" height="24" fill="#26a17b" />
      {glyph('₮')}
    </>
  ),
  CAD: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect width="5.5" height="24" fill="#d52b1e" />
      <rect x="18.5" width="5.5" height="24" fill="#d52b1e" />
      <polygon points={leaf} fill="#d52b1e" transform="translate(12 12) scale(0.72) translate(-12 -12)" />
    </>
  ),
  USD: (
    <>
      <rect width="24" height="24" fill="#fff" />
      {stripes.map((index) => (
        <rect key={index} y={index * (24 / 13)} width="24" height={24 / 13} fill="#b22234" />
      ))}
      <rect width="12" height={7 * (24 / 13)} fill="#3c3b6e" />
      {stars.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.75" fill="#fff" />
      ))}
    </>
  ),
};

/** Round colour mark for a currency: national flag for fiat, coin colour for digital assets. Decorative; pair with the code. */
export function AssetIcon({ currency, className }: { currency: Currency; className?: string | undefined }) {
  const clip = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <clipPath id={clip}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>{artwork[currency]}</g>
      <circle cx="12" cy="12" r="11.5" fill="none" stroke="#131a17" strokeOpacity="0.12" />
    </svg>
  );
}
