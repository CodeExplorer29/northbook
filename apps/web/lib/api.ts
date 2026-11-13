import { errorResponseSchema, type ErrorCode } from '@northbook/shared';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly requestId: string,
    readonly retryAt: number | null = null,
  ) {
    super(message);
    if (code === 'rate_limited' && retryAt === null) this.retryAt = Date.now() + 5000;
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers, cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const { error } = errorResponseSchema.parse(body);
    const retry = response.headers.get('retry-after');
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : null;
    throw new ApiError(
      error.code,
      error.message,
      error.requestId,
      seconds === null ? null : Date.now() + seconds * 1000,
    );
  }
  return body;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? `${error.message} Reference: ${error.requestId}`
    : 'Could not complete the request. Please retry.';
}
