import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDefaultRemoteAccessUrl, resolveRemoteAccessUrl } from '../dist/common/remote-access-url.js';

test('automatic remote access brackets a literal IPv6 host before adding the port', () => {
  for (const [wan, management, expected] of [
    ['2001:db8::6, 192.0.2.1', '192.0.2.2', 'https://[2001:db8::6]:9999'],
    [null, ' 2001:db8::7 ', 'https://[2001:db8::7]:9999'],
    ['::ffff:192.0.2.9', null, 'https://[::ffff:192.0.2.9]:9999'],
    ['[2001:db8::6]', null, 'https://[2001:db8::6]:9999'],
    ['192.0.2.1', '2001:db8::6', 'https://192.0.2.1:9999'],
  ]) {
    const url = buildDefaultRemoteAccessUrl(wan, management);
    assert.equal(url, expected);
    assert.equal(new URL(url).port, '9999');
  }
});

test('remote access keeps an operator override and handles a missing address', () => {
  assert.equal(resolveRemoteAccessUrl('  https://management.example.invalid:9443  ', '2001:db8::6'),
    'https://management.example.invalid:9443');
  assert.equal(resolveRemoteAccessUrl(null, ' ', null), null);
});
