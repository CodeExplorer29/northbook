'use client';

import { publicPriceEventSchema, type Pair, type PublicPriceEvent, type Side } from '@northbook/shared';
import { useEffect, useState } from 'react';
import type { WidgetPrice } from '../components/swap-widget';
import { api, ApiError } from './api';
import { useNow } from './use-now';

export function useIndicativePrice(
  pair: Pair,
  side: Side,
): { price: WidgetPrice; minimumCad: string; error: unknown; retry: () => void } {
  const key = `${pair}:${side}`;
  const [snapshot, setSnapshot] = useState<{ key: string; event: PublicPriceEvent | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const now = useNow();
  useEffect(() => {
    let active = true;
    let source: EventSource;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    function connect() {
      if (!active) return;
      source = new EventSource(`/api/public/prices/stream?${new URLSearchParams({ pair, side })}`);
      source.onmessage = (message) => {
        if (!active) return;
        try {
          const event = publicPriceEventSchema.parse(JSON.parse(message.data));
          if (event.pair === pair && event.side === side) {
            setSnapshot({ key, event });
            setError(null);
          }
        } catch {
          setSnapshot({ key, event: null });
        }
      };
      source.onerror = () => {
        source.close();
        if (!active) return;
        setSnapshot({ key, event: null });
        // EventSource hides HTTP status and headers. Probe the shared price
        // endpoint for the request reference and Retry-After, without displaying
        // its one-off value as a functioning live stream.
        void (async () => {
          let delay = 2000;
          try {
            await api(`/public/prices/${encodeURIComponent(pair)}?side=${side}`, {
              signal: controller.signal,
            });
            if (active) setError(new Error('Price stream disconnected.'));
          } catch (failure) {
            if (active) setError(failure);
            if (failure instanceof ApiError && failure.code === 'rate_limited')
              delay = Math.max(delay, (failure.retryAt ?? Date.now() + 5000) - Date.now());
          }
          if (active) timer = setTimeout(connect, delay);
        })();
      };
    }
    connect();
    return () => {
      active = false;
      source?.close();
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, pair, side, revision]);
  const feedback = {
    error,
    retry: () => {
      setRevision((value) => value + 1);
    },
  };
  if (!snapshot || snapshot.key !== key)
    return { ...feedback, price: { status: 'computing' }, minimumCad: '10000' };
  const event = snapshot.event;
  if (
    !event ||
    event.status !== 'ready' ||
    !now ||
    now - Date.parse(event.updatedAt) > 5000 ||
    Date.parse(event.updatedAt) > now + 1000
  ) {
    return {
      ...feedback,
      price: { status: 'unavailable' },
      minimumCad: event?.status === 'ready' ? event.minimumTradeCad : '10000',
    };
  }
  return {
    ...feedback,
    price: {
      status: 'ready',
      unitPrice: event.unitPrice,
      updatedAt: event.updatedAt,
      replayed: event.replayed,
      cadPerQuote: event.cadPerQuote,
    },
    minimumCad: event.minimumTradeCad,
  };
}
