# Public market recordings

`kraken.json` contains unauthenticated public WebSocket messages, including two
connections separated by an intentional disconnect. No orders are sent and no
account credentials are used. `capturedAt` and each relative `atMs` preserve the
original timing. Message strings preserve the original decimal digits.

Re-record from the repository root (Node 24 or later):

```sh
node --import tsx scripts/record-market-data.ts --venue kraken --seconds 3
```

The recorder subscribes to nine direct/bridge markets at 100 levels. It requires
a snapshot for each market on both connections before replacing the file.
`replayRecording` plays the same frames immediately in tests or at their recorded
pace. Venue adapters consume these frames through the same parser as live data.

Protocol references: [Kraken book channel](https://docs.kraken.com/exchange/api-reference/spot-websocket-v1/book)
and [checksum algorithm](https://docs.kraken.com/exchange/guides/websockets/book-checksum-v1).

The Kraken adapter checks every update's CRC32 before publishing a book, removes
zero-volume levels and waits for a new snapshot after a disconnect or checksum
failure. Live mode reconnects with bounded exponential backoff and polls public
REST snapshots while the socket is unavailable. Fees are explicit demo
configuration supplied by the caller, not an assertion about a current account's
fee tier. Replay uses the same decoder and marks every resulting book as replayed.

`coinbase.json.gz` is a gzip-compressed recording of the unauthenticated
`level2_batch` feed, including complete snapshots and reconnects. Its seven
markets were checked against the public product catalogue when recorded; delisted
BTC/USDC and ETH/USDC are excluded. The full book is retained internally, with the
best 100 levels published for pricing. Compression preserves original messages.

```sh
node --import tsx scripts/record-market-data.ts --venue coinbase --seconds 3
```

Protocol: [Coinbase Exchange channels](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels).
Public catalogue: [Exchange products](https://api.exchange.coinbase.com/products).

`binance.json` uses only `data-stream.binance.vision`, subscribing to complete
top-20 snapshots every 100ms for five crypto/stablecoin markets. Each message is
self-contained, so gaps do not require delta recovery; older update IDs are
discarded. Price requests must fit the available recorded depth. REST fallback
uses `data-api.binance.vision`. Sequence IDs are parsed losslessly as strings.

```sh
node --import tsx scripts/record-market-data.ts --venue binance --seconds 3
```

The command also writes `binance-markets.json`, a catalogue check showing the
total number of listed symbols, all CAD symbols and the selected market statuses.
It refuses a changed catalogue that adds CAD or disables a selected market.
Protocol references: [market-data-only hosts](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)
and [partial depth streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams).

Server startup defaults to `PRICING_MODE=replay`; use `PRICING_MODE=live` to open
public venue connections. Both modes use the same order-book decoders and route
selection. Database venue configuration is polled every two seconds; disabled or
stale books are excluded, and configuration older than five seconds fails closed.
`GET /api/staff/venues` reports venue status and staff can toggle `enabled` with
`PUT /api/staff/venues/:id`. Public health shows status and mode without fees.
