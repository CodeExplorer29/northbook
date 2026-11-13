'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { useNow } from '../lib/use-now';
import styles from './feedback.module.css';

export function SkeletonRows({
  columns,
  rows = 5,
  label = 'Loading rows',
}: {
  columns: number;
  rows?: number;
  label?: string;
}) {
  return (
    <tbody aria-busy="true" aria-label={label} className={styles.skeletonBody}>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              {row === 0 && column === 0 && (
                <span role="status" className={styles.srOnly}>
                  {label}
                </span>
              )}
              <span className={styles.skeleton} aria-hidden="true" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className={styles.empty}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="6" y="9" width="28" height="22" rx="6" />
        <path d="M12 17h16M12 23h10" />
      </svg>
      <p>{message}</p>
      {action && <Link href={action.href}>{action.label}</Link>}
    </div>
  );
}
function useRetry(onRetry: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const lock = useRef(false);
  async function retry() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await onRetry();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? { message: error.message, requestId: error.requestId }
          : { message: 'Could not connect. Please try again.' },
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, failure, retry };
}
export function ErrorState({
  message = 'Something went wrong.',
  requestId,
  onRetry,
}: {
  message?: string;
  requestId?: string;
  onRetry: () => Promise<void> | void;
}) {
  const { busy, failure, retry } = useRetry(onRetry);
  const reference = failure ? failure.requestId : requestId;
  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorIcon}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 7v6M12 16.5v.5" />
        </svg>
      </span>
      <p>
        {failure?.message ?? message}
        {reference && (
          <>
            {' '}
            Reference: <span className="figure">{reference}</span>
          </>
        )}
      </p>
      <button
        type="button"
        className="button-secondary"
        disabled={busy}
        onClick={() => {
          void retry();
        }}
      >
        {busy ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}
export function RateLimitBanner({
  retryAt,
  onRetry,
}: {
  retryAt: number | null;
  onRetry: () => Promise<void> | void;
}) {
  const now = useNow();
  const [fallback, setFallback] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFallback(Date.now() + 5000);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [retryAt]);
  const deadline = retryAt ?? fallback;
  const remaining = now && deadline !== null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const { busy, failure, retry } = useRetry(onRetry);
  return (
    <div className={styles.rateLimit}>
      <div role="status" className={styles.rateMessage}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>Too many requests. Try again in a moment.</span>
      </div>
      <button
        type="button"
        className={styles.retry}
        disabled={remaining !== 0 || busy}
        onClick={() => {
          if (remaining === 0) void retry();
        }}
      >
        {busy ? (
          'Retrying…'
        ) : remaining === null ? (
          'Try again shortly'
        ) : remaining > 0 ? (
          <>
            Try again in <span className="figure">{remaining}s</span>
          </>
        ) : (
          'Try again'
        )}
      </button>
      {failure && (
        <p className={styles.retryFailure} role="alert">
          {failure.message}
          {failure.requestId && (
            <>
              {' '}
              Reference: <span className="figure">{failure.requestId}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function ResourceFailure({
  error,
  retry,
  missing,
}: {
  error: unknown;
  retry: () => Promise<void> | void;
  missing?: { message: string; action: { label: string; href: string } };
}) {
  if (!error) return null;
  if (missing && error instanceof ApiError && error.code === 'not_found')
    return (
      <div role="alert">
        <EmptyState
          message={`${error.message} ${missing.message} Reference: ${error.requestId}`}
          action={missing.action}
        />
      </div>
    );
  if (error instanceof ApiError && error.code === 'rate_limited')
    return <RateLimitBanner retryAt={error.retryAt} onRetry={retry} />;
  return (
    <ErrorState
      {...(error instanceof ApiError
        ? { message: error.message, requestId: error.requestId }
        : { message: 'Could not complete the request. Please retry.' })}
      onRetry={retry}
    />
  );
}
