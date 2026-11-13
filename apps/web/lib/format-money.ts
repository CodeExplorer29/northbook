import { Money, displayPrecision, type Currency } from '@northbook/shared';

export function formatDecimal(value: string, places: number) {
  const [whole, fraction] = new Money(value).toFixed(places).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`;
}
export function formatAmount(value: string, currency: Currency) {
  return formatDecimal(value, displayPrecision[currency]);
}
export function formatPrice(value: string, base: Currency) {
  return formatDecimal(value, base === 'USDC' || base === 'USDT' ? 4 : 2);
}
