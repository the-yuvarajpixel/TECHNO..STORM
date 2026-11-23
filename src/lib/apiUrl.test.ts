import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBaseUrl, resolveSentinelWsUrl } from './apiUrl';

test('rejects markdown-formatted URLs and falls back to same-origin', () => {
  assert.equal(
    resolveApiBaseUrl('[https://sentinelexe.netlify.app](https://sentinelexe.netlify.app)', 'localhost'),
    '',
  );
  assert.equal(
    resolveApiBaseUrl('[https://sentinelexe.netlify.app](https://sentinelexe.netlify.app)', 'custom-site.com'),
    '',
  );
});

test('uses same-origin on co-hosted full-stack domains (localhost, *.run.app)', () => {
  assert.equal(
    resolveApiBaseUrl('https://sentinelexe.netlify.app', 'localhost'),
    '',
  );
  assert.equal(
    resolveApiBaseUrl(
      'https://sentinelexe.netlify.app',
      'ais-dev-d423ozcn5whsrllsbaurpv-707428643949.asia-east1.run.app',
    ),
    '',
  );
});

test('preserves valid external HTTPS URL on decoupled static hosts and strips trailing slashes', () => {
  assert.equal(
    resolveApiBaseUrl('  "https://api.sentinel.example.com///"  ', 'portal.sentinel.example.com'),
    'https://api.sentinel.example.com',
  );
});

test('rejects non-http protocols and whitespace strings', () => {
  assert.equal(resolveApiBaseUrl('javascript:alert(1)', 'portal.example.com'), '');
  assert.equal(resolveApiBaseUrl('https://bad host.example.com', 'portal.example.com'), '');
  assert.equal(resolveApiBaseUrl('/relative/path', 'portal.example.com'), '');
});

test('resolveSentinelWsUrl constructs wss/ws URLs cleanly and never throws', () => {
  assert.equal(
    resolveSentinelWsUrl('/ws/notifications', '', {
      protocol: 'http:',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    }),
    'ws://localhost:3000/ws/notifications',
  );
  assert.equal(
    resolveSentinelWsUrl('/ws/live?voice=Zephyr', 'https://api.sentinel.example.com', {
      protocol: 'https:',
      host: 'portal.sentinel.example.com',
      origin: 'https://portal.sentinel.example.com',
    }),
    'wss://api.sentinel.example.com/ws/live?voice=Zephyr',
  );
  assert.equal(
    resolveSentinelWsUrl('/ws/notifications', '[broken]', {
      protocol: 'https:',
      host: 'ais-dev.run.app',
      origin: 'https://ais-dev.run.app',
    }),
    'wss://ais-dev.run.app/ws/notifications',
  );
});
