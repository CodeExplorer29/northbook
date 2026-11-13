import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';

const frameSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('connected'), atMs: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal('disconnected'), atMs: z.number().nonnegative(), reason: z.string() }),
  z.strictObject({ kind: z.literal('message'), atMs: z.number().nonnegative(), data: z.string() }),
]);
export const recordingSchema = z
  .strictObject({
    version: z.literal(1),
    venue: z.enum(['kraken', 'coinbase', 'binance']),
    source: z.string().url(),
    capturedAt: z.string().datetime(),
    markets: z.array(z.string()).min(1),
    frames: z.array(frameSchema).min(1),
  })
  .superRefine((recording, context) => {
    let previous = -1;
    for (const frame of recording.frames) {
      if (frame.atMs < previous)
        context.addIssue({ code: 'custom', message: 'Recording frames must be ordered.' });
      previous = frame.atMs;
    }
  });
export type Recording = z.infer<typeof recordingSchema>;
export type RecordedFrame = Recording['frames'][number];

export async function readRecording(file: string | URL): Promise<Recording> {
  const bytes = await readFile(file);
  const text = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
  return recordingSchema.parse(JSON.parse(text));
}

// speed=0 is deterministic, immediate replay for tests; speed=1 preserves pace.
export async function replayRecording(
  recording: Recording,
  receive: (frame: RecordedFrame, receivedAt: number) => void,
  options: { speed?: number; baseTime?: number; signal?: AbortSignal } = {},
) {
  recordingSchema.parse(recording);
  const speed = options.speed ?? 0;
  if (speed < 0 || !Number.isFinite(speed)) throw new Error('Invalid replay speed.');
  const baseTime = options.baseTime ?? Date.parse(recording.capturedAt);
  let previous = 0;
  for (const frame of recording.frames) {
    options.signal?.throwIfAborted();
    if (speed > 0 && frame.atMs > previous)
      await delay((frame.atMs - previous) / speed, undefined, { signal: options.signal });
    receive(frame, baseTime + frame.atMs);
    previous = frame.atMs;
  }
}
