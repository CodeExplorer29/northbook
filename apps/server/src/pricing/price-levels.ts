import { Money, decimalStringSchema, positiveAmountSchema } from '@northbook/shared';
import type { PriceLevel } from './venue.js';

// Keep the full Coinbase book so deleting a top level reveals the correct next
// level. Sorted keys avoid sorting thousands of prices on every small update.
export class PriceLevels {
  private values = new Map<string, PriceLevel>();
  private keys: string[] = [];
  constructor(private readonly descending: boolean) {}
  private key(price: string, size: string) {
    positiveAmountSchema.parse(price);
    decimalStringSchema.parse(size);
    return new Money(price).toFixed();
  }
  replace(levels: readonly (readonly [string, string])[]) {
    this.values.clear();
    for (const [price, size] of levels) {
      const key = this.key(price, size);
      if (this.values.has(key)) throw new Error('Duplicate snapshot price.');
      if (!new Money(size).isZero()) this.values.set(key, { price, size });
    }
    this.keys = [...this.values.keys()].sort((a, b) => new Money(a).cmp(b) * (this.descending ? -1 : 1));
  }
  set(price: string, size: string) {
    const key = this.key(price, size);
    const exists = this.values.has(key);
    const removing = new Money(size).isZero();
    if (exists && !removing) {
      this.values.set(key, { price, size });
      return;
    }
    if (!exists && removing) return;
    let low = 0;
    let high = this.keys.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (new Money(this.keys[middle]!).cmp(key) * (this.descending ? -1 : 1) < 0) low = middle + 1;
      else high = middle;
    }
    if (removing) {
      this.keys.splice(low, 1);
      this.values.delete(key);
    } else {
      this.keys.splice(low, 0, key);
      this.values.set(key, { price, size });
    }
  }
  top(count: number) {
    return this.keys.slice(0, count).map((key) => ({ ...this.values.get(key)! }));
  }
}
