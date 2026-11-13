import { expect, it } from 'vitest';
import { normaliseAddress, signProxyAddress, trustedClientAddress, webClientAddress } from './proxy-auth.js';
const secret = 'test-proxy-secret-with-at-least-32-characters',
  now = 1794550000000;
it('accepts signed addresses only from private peers and binds signatures to time, method and URL', () => {
  const signature = signProxyAddress(secret, '203.0.113.4', 'GET', '/api/public/prices/ETH%2FCAD', now);
  const resolve = (
    peer = '127.0.0.1',
    address = '203.0.113.4',
    auth = signature,
    clock = now,
    method = 'GET',
    path = '/api/public/prices/ETH%2FCAD',
  ) => trustedClientAddress(peer, address, auth, secret, method, path, clock);
  expect(resolve()).toBe('203.0.113.4');
  expect(resolve('fd12::1')).toBe('203.0.113.4');
  expect(resolve('198.51.100.1')).toBe('198.51.100.1');
  expect(resolve('127.0.0.1', '203.0.113.5')).toBe('127.0.0.1');
  expect(resolve('127.0.0.1', '203.0.113.4', signature, now + 30001)).toBe('127.0.0.1');
  expect(resolve('127.0.0.1', '203.0.113.4', signature, now, 'POST')).toBe('127.0.0.1');
  expect(resolve('127.0.0.1', '203.0.113.4', signature, now, 'GET', '/api/demo/reset')).toBe('127.0.0.1');
  expect(trustedClientAddress('127.0.0.1', '203.0.113.4', undefined, secret, 'GET', '/')).toBe('127.0.0.1');
  expect(normaliseAddress('::ffff:127.0.0.1')).toBe('127.0.0.1');
  expect(normaliseAddress('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
});
it('ignores spoofed forwarding headers locally and only uses the explicit Railway ingress header in hosting mode', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '198.51.100.8' });
  expect(webClientAddress(headers, undefined)).toBe('127.0.0.1');
  expect(webClientAddress(headers, 'local')).toBe('127.0.0.1');
  expect(webClientAddress(headers, 'railway')).toBe('198.51.100.8');
  headers.set('x-real-ip', '198.51.100.8, 192.0.2.4');
  expect(webClientAddress(headers, 'railway')).toBeNull();
});
