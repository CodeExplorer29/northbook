import { randomUUID } from 'node:crypto';
import { signProxyAddress, webClientAddress } from '@northbook/shared/proxy-auth';
import type { ErrorResponse } from '@northbook/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(request: Request) {
  const incoming = new URL(request.url);
  const upstream = new URL(
    process.env.SERVER_URL ??
      `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? '3001'}`,
  );
  // Assign the path; never resolve a user-controlled path as an upstream URL.
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  const suppliedId = request.headers.get('x-request-id');
  const requestId = suppliedId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  const headers = new Headers({ 'x-request-id': requestId, 'accept-encoding': 'identity' });
  for (const name of ['accept', 'content-type', 'cookie', 'idempotency-key']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const address = webClientAddress(request.headers, process.env.CLIENT_IP_SOURCE);
  if (address) {
    headers.set('x-forwarded-for', address);
    const secret = process.env.PROXY_SECRET;
    if (secret && secret.length >= 32)
      headers.set(
        'x-northbook-proxy',
        signProxyAddress(secret, address, request.method, incoming.pathname + incoming.search),
      );
  }

  try {
    const options: RequestInit & { duplex: 'half' } = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: request.signal,
      duplex: 'half',
    };
    if (!['GET', 'HEAD'].includes(request.method)) options.body = request.body;
    const response = await fetch(upstream, options);
    const responseHeaders = new Headers({ 'x-request-id': requestId, 'cache-control': 'no-store' });
    for (const name of ['content-type', 'retry-after', 'location']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('x-accel-buffering', 'no');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    const body: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'The service is temporarily unavailable. Please retry.',
        requestId,
      },
    };
    return Response.json(body, { status: 500, headers: { 'x-request-id': requestId } });
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
