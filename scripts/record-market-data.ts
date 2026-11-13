import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { recordingSchema, type RecordedFrame, type Recording } from '../apps/server/src/pricing/recording.js';
import { coinbaseMarkets } from '../apps/server/src/pricing/coinbase.js';
import { binanceMarkets, binanceSubscription } from '../apps/server/src/pricing/binance.js';

const { values } = parseArgs({
  options: {
    venue: { type: 'string', default: 'kraken' },
    output: { type: 'string' },
    seconds: { type: 'string', default: '5' },
    reconnect: { type: 'boolean', default: true },
  },
});
if (values.venue !== 'kraken' && values.venue !== 'coinbase' && values.venue !== 'binance')
  throw new Error('Unsupported recording venue.');
const seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30)
  throw new Error('seconds must be from 1 to 30.');
const source =
  values.venue === 'kraken'
    ? 'wss://ws.kraken.com'
    : values.venue === 'coinbase'
      ? 'wss://ws-feed.exchange.coinbase.com'
      : 'wss://data-stream.binance.vision/stream';
const markets =
  values.venue === 'kraken'
    ? ['XBT/CAD', 'ETH/CAD', 'USDC/CAD', 'USDT/CAD', 'XBT/USD', 'ETH/USD', 'USDC/USD', 'USDT/USD', 'USD/CAD']
    : values.venue === 'coinbase'
      ? coinbaseMarkets.map((market) => market.symbol.replace('/', '-'))
      : binanceMarkets.map((market) => market.symbol.replace('/', ''));
const subscription =
  values.venue === 'kraken'
    ? { event: 'subscribe', pair: markets, subscription: { name: 'book', depth: 100 } }
    : values.venue === 'coinbase'
      ? { type: 'subscribe', product_ids: markets, channels: ['level2_batch', 'heartbeat'] }
      : binanceSubscription;
const started = Date.now();
const frames: RecordedFrame[] = [];

async function capture(reason: string) {
  return new Promise<void>((resolveCapture, reject) => {
    const socket = new WebSocket(source);
    let opened = false;
    const deadline = setTimeout(() => {
      socket.close();
      reject(new Error('Public feed connection timed out.'));
    }, 15000);
    let duration: ReturnType<typeof setTimeout> | undefined;
    socket.addEventListener('open', () => {
      clearTimeout(deadline);
      opened = true;
      frames.push({ kind: 'connected', atMs: Date.now() - started });
      socket.send(JSON.stringify(subscription));
      duration = setTimeout(() => socket.close(1000, reason), seconds * 1000);
    });
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        socket.close();
        reject(new Error('Expected text market data.'));
        return;
      }
      frames.push({ kind: 'message', atMs: Date.now() - started, data: event.data });
    });
    socket.addEventListener('error', () => {
      clearTimeout(deadline);
      clearTimeout(duration);
      reject(new Error('Public feed connection failed.'));
    });
    socket.addEventListener('close', () => {
      clearTimeout(deadline);
      clearTimeout(duration);
      frames.push({ kind: 'disconnected', atMs: Date.now() - started, reason });
      if (opened) resolveCapture();
      else reject(new Error('Public feed closed before connecting.'));
    });
  });
}

await capture(values.reconnect ? 'recorded reconnect' : 'recording complete');
if (values.reconnect) await capture('recording complete');
const recording: Recording = recordingSchema.parse({
  version: 1,
  venue: values.venue,
  source,
  capturedAt: new Date(started).toISOString(),
  markets,
  frames,
});
const sessions: Set<string>[] = [];
for (const frame of frames) {
  if (frame.kind === 'connected') sessions.push(new Set());
  if (frame.kind !== 'message') continue;
  const data = JSON.parse(frame.data);
  if (Array.isArray(data) && data[1]?.as) sessions.at(-1)!.add(String(data.at(-1)));
  if (data.type === 'snapshot') sessions.at(-1)!.add(data.product_id);
  if (data.stream && data.data?.lastUpdateId !== undefined)
    sessions.at(-1)!.add(String(data.stream).split('@')[0]!.toUpperCase());
}
if (sessions.some((snapshots) => markets.some((market) => !snapshots.has(market))))
  throw new Error('Recording is missing subscribed book snapshots.');
const destination =
  values.output ?? `apps/server/fixtures/${values.venue}.json${values.venue === 'coinbase' ? '.gz' : ''}`;
const output = resolve(destination);
await mkdir(dirname(output), { recursive: true });
const text = JSON.stringify(recording, null, 2) + '\n';
await writeFile(output, output.endsWith('.gz') ? gzipSync(text) : text);
if (values.venue === 'binance') {
  const source = 'https://data-api.binance.vision/api/v3/exchangeInfo';
  const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Binance market catalogue unavailable.');
  const catalogue = (await response.json()) as {
    symbols: { symbol: string; baseAsset: string; quoteAsset: string; status: string }[];
  };
  const cadMarkets = catalogue.symbols
    .filter((market) => market.baseAsset === 'CAD' || market.quoteAsset === 'CAD')
    .map((market) => market.symbol);
  const selected = catalogue.symbols
    .filter((market) => markets.includes(market.symbol))
    .map(({ symbol, baseAsset, quoteAsset, status }) => ({ symbol, baseAsset, quoteAsset, status }));
  await writeFile(
    resolve(dirname(output), 'binance-markets.json'),
    JSON.stringify(
      { capturedAt: new Date().toISOString(), source, total: catalogue.symbols.length, cadMarkets, selected },
      null,
      2,
    ) + '\n',
  );
  if (
    cadMarkets.length ||
    selected.length !== markets.length ||
    selected.some((market) => market.status !== 'TRADING')
  )
    throw new Error('Binance market catalogue changed; review supported markets.');
}
console.log(
  `Recorded ${frames.length} frames and ${sessions.reduce((sum, session) => sum + session.size, 0)} snapshots to ${destination}.`,
);
