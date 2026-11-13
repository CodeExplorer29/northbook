import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const historicalPrice = z.object({
  marketPrice: z.string(),
  spreadBps: z.number(),
  route: z.array(
    z.object({
      venue: z.string(),
      market: z.string(),
      action: z.string(),
      price: z.string(),
      fee: z.string(),
    }),
  ),
});
const sampleSchema = z.object({
  organisations: z.array(
    z.object({
      name: z.string(),
      jurisdiction: z.string(),
      tier: z.string(),
      kyb: z.string(),
      maxTrade: z.string(),
    }),
  ),
  activeQuote: z.object({ id: z.string(), staffView: historicalPrice }),
  buyQuoteExample: z.object({ id: z.string(), staffView: historicalPrice }),
  trade: z.object({ booked: z.string() }),
  recentQuotes: z.array(
    z.object({
      time: z.string(),
      id: z.string(),
      pair: z.string(),
      side: z.enum(['Buy', 'Sell']),
      youPay: z.string(),
      youReceive: z.string(),
      price: z.string(),
      status: z.string(),
    }),
  ),
  blotterTrades: z.array(
    z.object({
      booked: z.string(),
      id: z.string(),
      organisation: z.string(),
      pair: z.string(),
      side: z.enum(['Buy', 'Sell']),
      base: z.string(),
      quote: z.string(),
      clientPrice: z.string(),
      status: z.string(),
    }),
  ),
  kybApplication: z.object({
    business: z.object({
      legalName: z.string(),
      registrationNumber: z.string(),
      jurisdiction: z.string(),
      natureOfBusiness: z.string(),
    }),
    beneficialOwners: z.array(z.object({ name: z.string(), ownership: z.string() })),
  }),
  configuration: z.object({
    spreadsBps: z.object({ tiers: z.array(z.object({ tier: z.string(), values: z.array(z.number()) })) }),
    quoteLifetimeSeconds: z.number(),
    minimumTrade: z.string(),
    publicReferenceSpreadBps: z.number(),
  }),
});
export const readSample = async () =>
  sampleSchema.parse(
    JSON.parse(
      await readFile(new URL('../../../../docs/design/05-sample-data.json', import.meta.url), 'utf8'),
    ),
  );
export const sampleNumber = (value: string) => value.replace(/[^\d.]/g, '');
