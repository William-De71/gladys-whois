import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDomain, displayDomain, tldOf } from '../src/domain.js';
import { normalizeConfig, splitDomains, MAX_DOMAINS, AUTO_LANGUAGE } from '../src/config.js';

test('a domain typed in any form becomes its ASCII name', () => {
  assert.equal(normalizeDomain('Example.FR'), 'example.fr');
  assert.equal(normalizeDomain(' https://www.example.fr/contact?x=1 '), 'example.fr');
  assert.equal(normalizeDomain('example.com.'), 'example.com');
  assert.equal(normalizeDomain('http://example.com:8080'), 'example.com');
  assert.equal(normalizeDomain('café.fr'), 'xn--caf-dma.fr');
  assert.equal(normalizeDomain('example.co.uk'), 'example.co.uk');
  assert.equal(normalizeDomain('sub.example.org'), 'sub.example.org');
});

test('what is not a domain name is refused', () => {
  for (const entry of ['', 'localhost', '192.168.1.1', '-bad.fr', 'bad-.fr', 'a b.fr', 'x..fr']) {
    assert.equal(normalizeDomain(entry), null, entry);
  }
  assert.equal(normalizeDomain(`${'a'.repeat(64)}.fr`), null);
});

test('display name, TLD', () => {
  assert.equal(displayDomain('xn--caf-dma.fr'), 'café.fr');
  assert.equal(displayDomain('example.fr'), 'example.fr');
  assert.equal(tldOf('example.co.uk'), 'uk');
});

test('configuration: split, normalized, deduplicated, ten at most', () => {
  assert.deepEqual(splitDomains('a.fr, b.fr;c.fr\nd.fr  e.fr'), [
    'a.fr',
    'b.fr',
    'c.fr',
    'd.fr',
    'e.fr',
  ]);
  const config = normalizeConfig({
    domains: 'Example.fr, https://www.example.fr/, not a domain, example.com',
    language: 'de',
  });
  assert.deepEqual(config.domains, ['example.fr', 'example.com']);
  assert.deepEqual(config.invalid, ['not', 'a', 'domain']);
  assert.equal(config.language, 'de');
  const many = normalizeConfig({
    domains: Array.from({ length: 12 }, (_, i) => `d${i}.fr`).join(','),
  });
  assert.equal(many.domains.length, MAX_DOMAINS);
  assert.deepEqual(many.dropped, ['d10.fr', 'd11.fr']);
  assert.equal(normalizeConfig().language, AUTO_LANGUAGE);
  assert.equal(normalizeConfig(null).domains.length, 0);
});
