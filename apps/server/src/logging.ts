import { pino, type DestinationStream } from 'pino';

export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        remove: true,
      },
      serializers: {
        // Database driver errors can carry a client object containing credentials.
        err: (error: unknown) =>
          error instanceof Error
            ? { type: error.name, message: error.message, stack: error.stack }
            : { type: 'UnknownError' },
        // Session cookies are never included in request or response logs.
        req: (request: { method: string; url: string }) => ({
          method: request.method,
          url: request.url.split('?')[0],
        }),
        res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
      },
    },
    destination,
  );
}
