'use client';

import {
  Money,
  currencySchema,
  displayPrecision,
  pairCurrencies,
  pairSchema,
  quoteAmounts,
  quoteRequestSchema,
  type Currency,
  type QuoteRequest,
} from '@northbook/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { errorMessage } from '../lib/api';
import { formatDecimal, formatPrice } from '../lib/format-money';
import { useNow } from '../lib/use-now';
import { AssetIcon } from './asset-icon';
import { StatusChip } from './data-display';
import styles from './trading.module.css';

export type WidgetPrice =
  | { status: 'ready'; unitPrice: string; updatedAt: string; replayed: boolean; cadPerQuote: string }
  | { status: 'computing' | 'unavailable' };
const cryptoAssets: readonly Currency[] = ['BTC', 'ETH', 'USDC', 'USDT'];
const fiatAssets: readonly Currency[] = ['CAD', 'USD'];
/** Asset picker with coin marks in the list; a native select cannot render them. */
function AssetSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: Currency;
  options: readonly Currency[];
  disabled: boolean;
  onChange: (asset: Currency) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(asset: Currency) {
    close();
    if (asset !== value) onChange(asset);
  }
  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null;
    if (target !== null) {
      event.preventDefault();
      items[Math.min(items.length - 1, Math.max(0, target))]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') setOpen(false);
    else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      const asset = options[index];
      if (asset) choose(asset);
    }
  }
  return (
    <div className={styles.assetSelect} ref={root}>
      <button
        type="button"
        ref={trigger}
        className={styles.assetSelector}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <AssetIcon currency={value} className={styles.coin} />
        <span>{value}</span>
        <svg
          className={styles.assetCaret}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul ref={list} className={styles.assetMenu} role="listbox" aria-label={label} onKeyDown={onKeyDown}>
          {options.map((asset) => (
            <li
              key={asset}
              role="option"
              aria-selected={asset === value}
              tabIndex={-1}
              className={styles.assetOption}
              onClick={() => {
                choose(asset);
              }}
            >
              <AssetIcon currency={asset} className={styles.coin} />
              <span>{asset}</span>
              {asset === value && (
                <svg
                  className={styles.assetCheck}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SwapWidget({
  mode,
  value,
  onChange,
  price,
  onAction,
  minimumCad = '10000',
  busy = false,
  actionDisabled = false,
}: {
  mode: 'indicative' | 'firm';
  value: QuoteRequest;
  onChange: (value: QuoteRequest) => void;
  price: WidgetPrice;
  onAction: (value: QuoteRequest) => void | Promise<void>;
  minimumCad?: string;
  busy?: boolean;
  actionDisabled?: boolean;
}) {
  const id = useId();
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const lock = useRef(false);
  const { base, quote } = pairCurrencies(value.pair);
  const payingBase = value.side === 'SELL';
  const payCurrency = payingBase ? base : quote;
  const receiveCurrency = payingBase ? quote : base;
  let amounts: ReturnType<typeof quoteAmounts> | null = null;
  if (price.status === 'ready' && quoteRequestSchema.safeParse(value).success) {
    try {
      amounts = quoteAmounts({ ...value, price: price.unitPrice });
    } catch {
      /* Keep entered text while it is incomplete or cannot be priced. */
    }
  }
  const belowMinimum =
    amounts && price.status === 'ready'
      ? new Money(amounts.quoteAmount).mul(price.cadPerQuote).lt(minimumCad)
      : false;
  const disabled = busy || pending;
  function editAmount(row: 'pay' | 'receive', text: string) {
    const fixed = (row === 'pay' ? payingBase : !payingBase) ? 'base' : 'quote';
    setFailure('');
    onChange({ ...value, fixed, amount: text.replace(/,/g, '') });
  }
  function editCurrency(row: 'pay' | 'receive', currency: string) {
    const chosen = currencySchema.parse(currency);
    const baseRow = row === 'pay' ? payingBase : !payingBase;
    onChange({ ...value, pair: pairSchema.parse(baseRow ? `${chosen}/${quote}` : `${base}/${chosen}`) });
    setFailure('');
  }
  function flip() {
    // Keep the exact fixed currency and amount; it moves to the other row.
    onChange({ ...value, side: value.side === 'SELL' ? 'BUY' : 'SELL' });
    setFailure('');
  }
  async function submit() {
    if (lock.current || disabled || actionDisabled || !amounts || belowMinimum || price.status !== 'ready')
      return;
    lock.current = true;
    setPending(true);
    setFailure('');
    try {
      await onAction(value);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const row = (kind: 'pay' | 'receive', currency: Currency) => {
    const baseRow = kind === 'pay' ? payingBase : !payingBase;
    const isFixed = value.fixed === (baseRow ? 'base' : 'quote');
    const computed = amounts ? (kind === 'pay' ? amounts.payAmount : amounts.receiveAmount) : '';
    const text = isFixed
      ? value.amount
      : computed
        ? new Money(computed).toFixed(displayPrecision[currency])
        : '';
    const lengthClass = text.length <= 5 ? '' : text.length <= 10 ? styles.amountMedium : styles.amountLong;
    const computing = price.status === 'computing' && !isFixed;
    return (
      <div className={`${styles.amountRow} ${kind === 'pay' ? styles.payRow : ''}`} aria-busy={computing}>
        <label htmlFor={`${id}-${kind}`}>You {kind === 'pay' ? 'pay' : 'receive'}</label>
        <div className={styles.entryLine}>
          {computing ? (
            <div className={styles.amountSkeleton} role="status" aria-label="Computing amount" />
          ) : (
            <input
              id={`${id}-${kind}`}
              className={`figure ${styles.amountInput} ${lengthClass}`}
              aria-label={`You ${kind === 'pay' ? 'pay' : 'receive'}`}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              disabled={disabled}
              value={text}
              placeholder="—"
              onChange={(event) => {
                editAmount(kind, event.target.value);
              }}
            />
          )}
          <AssetSelect
            label={`${kind === 'pay' ? 'Pay' : 'Receive'} asset`}
            value={currency}
            options={baseRow ? cryptoAssets : fiatAssets}
            disabled={disabled}
            onChange={(asset) => {
              editCurrency(kind, asset);
            }}
          />
        </div>
      </div>
    );
  };
  return (
    <section
      className={styles.widget}
      aria-label={mode === 'indicative' ? 'Indicative conversion' : 'Request a firm quote'}
    >
      <div className={styles.widgetHeading}>
        <span>{mode === 'indicative' ? 'Indicative price' : 'Your trade'}</span>
        {mode === 'indicative' && <StatusChip tone="indicative">Indicative</StatusChip>}
      </div>
      {row('pay', payCurrency)}
      <div className={styles.flipSlot}>
        <button
          type="button"
          className={styles.flip}
          aria-label="Swap direction"
          disabled={disabled}
          onClick={flip}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
          </svg>
        </button>
      </div>
      {row('receive', receiveCurrency)}
      <div className={styles.priceLine}>
        {price.status === 'ready' ? (
          <>
            <span className="figure">
              1 {base} = {formatPrice(price.unitPrice, base)} {quote}
            </span>
            <span className={styles.updated}>
              Updated{' '}
              <span className="figure">
                {now ? Math.max(0, Math.floor((now - Date.parse(price.updatedAt)) / 1000)) : 0}s
              </span>{' '}
              ago
            </span>
          </>
        ) : price.status === 'unavailable' ? (
          <p className={styles.unavailable} role="status">
            Waiting for price updates
          </p>
        ) : (
          <span role="status" className={styles.computing}>
            Computing price…
          </span>
        )}
      </div>
      {belowMinimum && (
        <p className={styles.alert} role="alert">
          Minimum trade is <span className="figure">{formatDecimal(minimumCad, 0)}</span> CAD
        </p>
      )}
      {failure && (
        <p className={styles.alert} role="alert">
          {failure}
        </p>
      )}
      <button
        type="button"
        className={`button-primary ${styles.fullWidth}`}
        aria-describedby={`${id}-note`}
        disabled={disabled || actionDisabled || !amounts || !!belowMinimum || price.status !== 'ready'}
        onClick={() => {
          void submit();
        }}
      >
        {actionDisabled && (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        )}
        {disabled ? 'Requesting…' : mode === 'indicative' ? 'Get a firm quote' : 'Get quote'}
      </button>
      <p id={`${id}-note`} className={styles.disclaimer}>
        {mode === 'indicative'
          ? 'Indicative price. Your final price is given in a firm quote after verification.'
          : 'Request an all-in price for your exact amount. The quote is valid for a limited time.'}
      </p>
    </section>
  );
}
