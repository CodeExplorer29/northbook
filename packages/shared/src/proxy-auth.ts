// Node-only entry point: never exported from the browser-safe shared barrel.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
const privatePeers = new BlockList();
for (const [network, prefix] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const)
  privatePeers.addSubnet(network, prefix, 'ipv4');
privatePeers.addAddress('::1', 'ipv6');
privatePeers.addSubnet('fc00::', 7, 'ipv6');
export function normaliseAddress(value: string | undefined) {
  if (!value || !isIP(value)) return null;
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7);
  return isIP(value) === 6 ? new URL(`http://[${value}]`).hostname.slice(1, -1) : value;
}
export function signProxyAddress(
  secret: string,
  address: string,
  method: string,
  path: string,
  now = Date.now(),
) {
  const timestamp = String(now);
  return `${timestamp}.${createHmac('sha256', secret).update([timestamp, address, method, path].join('\n')).digest('hex')}`;
}
export function trustedClientAddress(
  peer: string | undefined,
  address: string | undefined,
  signature: string | undefined,
  secret: string | undefined,
  method: string,
  path: string,
  now = Date.now(),
) {
  const remote = normaliseAddress(peer) ?? 'unknown';
  const forwarded = normaliseAddress(address);
  const privatePeer = isIP(remote) ? privatePeers.check(remote, isIP(remote) === 6 ? 'ipv6' : 'ipv4') : false;
  if (!privatePeer || !forwarded || !secret || secret.length < 32 || !signature) return remote;
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(signature);
  if (!match || Math.abs(now - Number(match[1])) > 30000) return remote;
  const expected = signProxyAddress(secret, forwarded, method, path, Number(match[1]));
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? forwarded : remote;
}
// Local development is loopback-only. Caller-supplied forwarding headers cannot
// create identities. Railway mode is explicitly enabled only behind its edge.
export function webClientAddress(headers: Headers, mode: string | undefined) {
  return mode === 'railway' ? normaliseAddress(headers.get('x-real-ip') ?? undefined) : '127.0.0.1';
}
