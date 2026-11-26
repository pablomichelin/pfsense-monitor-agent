import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './source-harness.mjs';

const { buildDefaultRemoteAccessUrl } = sourceLoader()('lib/remote-access-url.ts');

test('the firewall registration form derives a valid remote address for IPv4 and IPv6', () => {
  for (const [wan, management, expected] of [
    ['2001:db8::6', '192.0.2.1', 'https://[2001:db8::6]:9999'],
    ['', '2001:db8::7, 192.0.2.3', 'https://[2001:db8::7]:9999'],
    ['[2001:db8::9]', '', 'https://[2001:db8::9]:9999'],
    ['192.0.2.1', '2001:db8::6', 'https://192.0.2.1:9999'],
  ]) {
    const url = buildDefaultRemoteAccessUrl(wan, management);
    assert.equal(url, expected);
    assert.equal(new URL(url).port, '9999');
  }
  assert.equal(buildDefaultRemoteAccessUrl('', null), '');
});
