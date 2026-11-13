'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './data-display.module.css';
import { SkeletonRows } from './feedback';

export type StatusTone = 'positive' | 'neutral' | 'danger' | 'indicative';
export function StatusChip({
  children,
  tone = 'neutral',
  dense = false,
}: {
  children: string;
  tone?: StatusTone;
  dense?: boolean;
}) {
  return <span className={`chip chip-${tone} ${dense ? styles.denseChip : ''}`}>{children}</span>;
}

export function KeyValue({
  label,
  value,
  copyValue,
  numeric = false,
}: {
  label: string;
  value: ReactNode;
  copyValue?: string;
  numeric?: boolean;
}) {
  const [result, setResult] = useState<{ value: string; status: 'copied' | 'failed' } | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    if (copyValue === undefined || lock.current) return;
    lock.current = true;
    setPending(true);
    setResult(null);
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(copyValue);
      setResult({ value: copyValue, status: 'copied' });
    } catch {
      setResult({ value: copyValue, status: 'failed' });
    } finally {
      lock.current = false;
      setPending(false);
      timer.current = setTimeout(() => {
        setResult(null);
      }, 1600);
    }
  }
  const feedback = result?.value === copyValue ? result?.status : null;
  return (
    <div className={styles.keyValue}>
      <dt>{label}</dt>
      <dd className={`${styles.value} ${numeric ? 'figure' : ''}`}>{value}</dd>
      {copyValue !== undefined && (
        <dd className={styles.copyCell}>
          <button
            type="button"
            className={styles.copy}
            disabled={pending}
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
              void copy();
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
            {pending ? 'Copying…' : feedback === 'copied' ? 'Copied' : 'Copy'}
          </button>
          <span role="status" className={feedback === 'failed' ? styles.copyFailure : styles.srOnly}>
            {feedback === 'failed'
              ? 'Could not copy. Select and copy the value.'
              : feedback === 'copied'
                ? `${label} copied.`
                : ''}
          </span>
        </dd>
      )}
    </div>
  );
}

export type TimelineStep = {
  id: string;
  label: string;
  state: 'done' | 'current' | 'future' | 'cancelled';
  at?: string;
  simulated?: boolean;
};
export function Timeline({ steps, label = 'Timeline' }: { steps: readonly TimelineStep[]; label?: string }) {
  return (
    <ol className={styles.timeline} aria-label={label}>
      {steps.map((step) => (
        <li
          key={step.id}
          className={styles[step.state]}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <div className={styles.track} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.line} />
          </div>
          <div className={styles.stepContent}>
            <div className={styles.stepLabel}>
              {step.label}
              <span className={styles.srOnly}>
                {' '}
                ·{' '}
                {step.state === 'done'
                  ? 'Completed'
                  : step.state === 'future'
                    ? 'Upcoming'
                    : step.state === 'current'
                      ? 'Current step'
                      : 'Cancelled'}
              </span>
              {step.simulated && <span className={styles.simulated}>Simulated</span>}
            </div>
            {step.at ? (
              <time className="figure" dateTime={step.at} title={`${step.at} (UTC)`}>
                {new Date(step.at).toLocaleTimeString('en-GB', { timeZone: 'UTC' })}
              </time>
            ) : (
              <span className={`figure ${styles.time}`}>{step.state === 'current' ? 'Now' : '—'}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type DataColumn<Row> = {
  key: string;
  heading: string;
  numeric?: boolean;
  mono?: boolean;
  render: (row: Row) => ReactNode;
};
export function DataTable<Row>({
  label,
  rows,
  columns,
  rowKey,
  dense = false,
  empty,
  loading = false,
}: {
  label: string;
  rows: readonly Row[];
  columns: readonly DataColumn<Row>[];
  rowKey: (row: Row) => string;
  dense?: boolean;
  empty?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={styles.tableScroll} role="region" aria-label={label} tabIndex={0}>
      <table className={`table ${styles.table} ${dense ? `table-dense ${styles.dense}` : ''}`}>
        <caption className={styles.srOnly}>{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? 'numeric' : undefined}>
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
        {loading ? (
          <SkeletonRows columns={columns.length} label={`Loading ${label.toLowerCase()}`} />
        ) : (
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.numeric ? 'numeric' : column.mono ? 'figure' : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={`${styles.empty} ${empty ? styles.emptyPanel : ''}`}>
                  {empty ?? 'Nothing matches these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

export type FilterOption<Value extends string> = { value: Value; label: string; count?: number };
export function FilterPills<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className={styles.filters} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
          {option.count !== undefined && <span className="figure">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export type TabOption<Value extends string> = FilterOption<Value> & { panel: ReactNode };
export function Tabs<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly TabOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div
        ref={list}
        className={styles.tabs}
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const selected = options.findIndex((option) => option.value === value);
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? options.length - 1
                : (selected + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
          const next = options[index];
          if (next) {
            onChange(next.value);
            list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
          }
        }}
      >
        {options.map((option, index) => (
          <button
            type="button"
            id={`${id}-tab-${index}`}
            key={option.value}
            role="tab"
            aria-selected={option.value === value}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={option.value === value ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
            {option.count !== undefined && <span className="figure">{option.count}</span>}
          </button>
        ))}
      </div>
      {options.map((option, index) => (
        <div
          key={option.value}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={option.value !== value}
          tabIndex={0}
        >
          {option.panel}
        </div>
      ))}
    </div>
  );
}
