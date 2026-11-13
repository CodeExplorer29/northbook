import { Money } from '@northbook/shared';
import { replayRecording, type RecordedFrame, type Recording } from './recording.js';
import type { Market, OrderBook, VenueAdapter, VenueHealth, VenueId, VenueListener } from './venue.js';

export interface BookDecoder {
  readonly markets: readonly Market[];
  reset(): void;
  receive(message: string, receivedAt: number, replayed: boolean): OrderBook[];
}
export interface FeedOptions {
  id: VenueId;
  url: string;
  subscription: object;
  decoder: BookDecoder;
  feeRate: string;
  recording?: Recording;
  loop?: boolean;
  speed?: number;
  poll?: (signal: AbortSignal) => Promise<OrderBook>;
}

// Live and replay share the decoder and all invalidation rules. A disconnect
// always makes old books unavailable; deltas cannot resurrect a missing snapshot.
export class FeedAdapter implements VenueAdapter {
  readonly id: VenueId;
  readonly markets: readonly Market[];
  private state: VenueHealth;
  private current = new Map<string, OrderBook>();
  private listener?: VenueListener;
  private controller: AbortController | undefined;
  private socket: WebSocket | undefined;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private polling?: ReturnType<typeof setTimeout>;
  private playback?: Promise<void>;
  private attempts = 0;

  constructor(private readonly options: FeedOptions) {
    this.id = options.id;
    this.markets = options.decoder.markets;
    if (
      !new Money(options.feeRate).isFinite() ||
      new Money(options.feeRate).lt(0) ||
      new Money(options.feeRate).gte(1)
    )
      throw new Error('Invalid venue fee rate.');
    if (options.recording && options.recording.venue !== this.id)
      throw new Error('Recording belongs to another venue.');
    if (options.loop && options.speed === 0) throw new Error('Looped replay requires a positive speed.');
    this.state = {
      venue: this.id,
      status: 'disconnected',
      lastUpdate: null,
      replayed: Boolean(options.recording),
    };
  }
  takerFee(market: string) {
    if (!this.markets.some((item) => item.symbol === market)) throw new Error('Unsupported venue market.');
    return this.options.feeRate;
  }
  health() {
    return { ...this.state };
  }
  books() {
    return structuredClone([...this.current.values()]);
  }
  private status(status: VenueHealth['status'], detail?: string) {
    const { venue, lastUpdate, replayed } = this.state;
    this.state = { venue, lastUpdate, replayed, status, ...(detail ? { detail } : {}) };
    this.listener?.({ type: 'health', health: this.health() });
  }
  private invalidate(status: VenueHealth['status'], detail?: string) {
    this.current.clear();
    this.options.decoder.reset();
    this.status(status, detail);
  }
  private publish(book: OrderBook, status: VenueHealth['status'] = 'connected') {
    this.current.set(book.market.symbol, book);
    this.state.lastUpdate = book.receivedAt;
    if (this.state.status !== status) this.status(status);
    this.listener?.({ type: 'book', book: structuredClone(book) });
  }
  private receive(frame: RecordedFrame, receivedAt: number) {
    if (frame.kind === 'connected') {
      this.invalidate('resynchronising');
      return;
    }
    if (frame.kind === 'disconnected') {
      this.invalidate('disconnected', frame.reason);
      return;
    }
    try {
      const books = this.options.decoder.receive(frame.data, receivedAt, Boolean(this.options.recording));
      for (const book of books) this.publish(book);
      if (books.length) this.attempts = 0;
    } catch (error) {
      this.invalidate('resynchronising', error instanceof Error ? error.message : 'Invalid venue data.');
      this.socket?.close();
    }
  }
  async start(listener: VenueListener) {
    if (this.controller) throw new Error('Venue adapter already started.');
    this.listener = listener;
    this.controller = new AbortController();
    this.status('connecting');
    const recording = this.options.recording;
    if (recording) {
      const signal = this.controller.signal;
      this.playback = (async () => {
        do {
          await replayRecording(recording, (frame, time) => this.receive(frame, time), {
            speed: this.options.speed ?? (this.options.loop ? 1 : 0),
            baseTime: Date.now(),
            signal,
          });
        } while (this.options.loop && !signal.aborted);
      })().catch((error: unknown) => {
        if (!signal.aborted) {
          this.invalidate('disconnected', 'Replay failed.');
          throw error;
        }
      });
      if (!this.options.loop) await this.playback;
    } else this.connect();
  }
  private connect() {
    const signal = this.controller!.signal;
    if (signal.aborted) return;
    this.status('connecting');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    const armWatchdog = () => {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => socket.close(), 20000);
    };
    armWatchdog();
    socket.addEventListener('open', () => {
      if (signal.aborted) {
        socket.close();
        return;
      }
      clearTimeout(this.polling);
      this.receive({ kind: 'connected', atMs: 0 }, Date.now());
      socket.send(JSON.stringify(this.options.subscription));
      armWatchdog();
    });
    socket.addEventListener('message', (event) => {
      if (signal.aborted || socket !== this.socket) return;
      armWatchdog();
      if (typeof event.data !== 'string') {
        socket.close();
        return;
      }
      this.receive({ kind: 'message', atMs: 0, data: event.data }, Date.now());
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      clearTimeout(this.watchdog);
      if (signal.aborted || socket !== this.socket) return;
      this.receive({ kind: 'disconnected', atMs: 0, reason: 'Public feed disconnected.' }, Date.now());
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)),
      );
      this.schedulePoll();
    });
  }
  private schedulePoll() {
    clearTimeout(this.polling);
    if (!this.options.poll || !this.controller || this.controller.signal.aborted) return;
    const signal = this.controller.signal;
    this.polling = setTimeout(async () => {
      try {
        const book = await this.options.poll!(signal);
        if (!signal.aborted && this.socket?.readyState !== WebSocket.OPEN) this.publish(book, 'polling');
      } catch {
        /* Failed snapshots never refresh a stale book's timestamp. */
      }
      if (!signal.aborted && this.socket?.readyState !== WebSocket.OPEN) this.schedulePoll();
    }, 1000);
  }
  async stop() {
    this.controller?.abort();
    clearTimeout(this.retry);
    clearTimeout(this.watchdog);
    clearTimeout(this.polling);
    this.socket?.close();
    await this.playback;
    this.invalidate('disconnected', 'Adapter stopped.');
    this.controller = undefined;
    this.socket = undefined;
  }
}
