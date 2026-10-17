import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegistryClient,
  readBootstrap,
  readDate,
  readIanaWhois,
  readRdap,
  readWhois,
  BOOTSTRAP_URL,
} from '../src/registry.js';
import { FIXTURES } from './helpers/fixtures.js';

test('RDAP: expiration, creation, change, registrar and statuses (Verisign, Afnic)', () => {
  assert.deepEqual(readRdap(FIXTURES.gladys), {
    expiresAt: '2026-12-19T10:31:28.000Z',
    registeredAt: '2018-12-19T10:31:28.000Z',
    changedAt: '2025-11-19T04:07:59.000Z',
    registrar: 'Cloudflare, Inc.',
    statuses: ['client transfer prohibited'],
    source: 'rdap',
  });
  const afnic = readRdap(FIXTURES.afnic);
  assert.equal(afnic.expiresAt, '2029-07-18T08:26:59.000Z');
  // The registrar, not the registrant nor the technical contact.
  assert.equal(afnic.registrar, 'Registry Operations');
  assert.deepEqual(afnic.statuses, ['active']);
});

test('RDAP: an answer without expiration is no_expiry, another object is invalid', () => {
  const noDate = { ...FIXTURES.gladys, events: [] };
  assert.throws(() => readRdap(noDate), { kind: 'no_expiry' });
  assert.throws(() => readRdap({ objectClassName: 'entity' }), { kind: 'invalid' });
});

test('whois: .io (ICANN style), .it (blocks), .de (no date), not found', () => {
  const io = readWhois(FIXTURES.nicIo);
  assert.equal(io.expiresAt, '2027-05-01T00:00:02.000Z');
  assert.equal(io.registrar, 'Registry Operator acts as Registrar');
  assert.ok(io.statuses.includes('server transfer prohibited'));
  assert.equal(io.source, 'whois');
  const it = readWhois(FIXTURES.nicIt);
  assert.equal(it.expiresAt, '2026-12-31T00:00:00.000Z');
  assert.equal(it.registeredAt, '1997-08-27T00:00:00.000Z');
  assert.equal(it.registrar, "ccTLD 'it' Registry");
  assert.throws(() => readWhois(FIXTURES.denic), { kind: 'no_expiry' });
  assert.throws(() => readWhois(FIXTURES.notFound), { kind: 'not_found' });
  assert.throws(() => readWhois('garbage'), { kind: 'invalid' });
});

test('dates: the formats registries write', () => {
  assert.equal(readDate('2026-12-31'), '2026-12-31T00:00:00.000Z');
  assert.equal(readDate('2026.12.31'), '2026-12-31T00:00:00.000Z');
  assert.equal(readDate('2026-12-31 10:20:30'), '2026-12-31T10:20:30.000Z');
  assert.equal(readDate('2026-12-31T10:20:30+02:00'), '2026-12-31T08:20:30.000Z');
  assert.equal(readDate('31-Dec-2026'), '2026-12-31T00:00:00.000Z');
  assert.equal(readDate('2027-05-01T00:00:02Z'), '2027-05-01T00:00:02.000Z');
  assert.equal(readDate(''), null);
  assert.equal(readDate('soon'), null);
});

test('IANA: the RDAP server per TLD, the whois server of a TLD', () => {
  const servers = readBootstrap(FIXTURES.bootstrap);
  assert.equal(servers.com, 'https://rdap.verisign.com/com/v1/');
  assert.equal(servers.fr, 'https://rdap.nic.fr/');
  assert.equal(servers.io, undefined);
  assert.throws(() => readBootstrap({ services: [] }), { kind: 'invalid' });
  assert.equal(readIanaWhois(FIXTURES.ianaIo), 'whois.nic.io');
  assert.equal(readIanaWhois('domain: TEST\n'), null);
});

test('client: URLs, HTTP errors sorted, whois refusals told from terms of use', async () => {
  const urls = [];
  const answers = {
    [BOOTSTRAP_URL]: { status: 200, body: JSON.stringify(FIXTURES.bootstrap) },
    'https://rdap.nic.fr/domain/afnic.fr': { status: 200, body: JSON.stringify(FIXTURES.afnic) },
    'https://rdap.nic.fr/domain/free.fr': { status: 404, body: '' },
    'https://rdap.nic.fr/domain/busy.fr': { status: 429, body: '' },
    'https://rdap.nic.fr/domain/broken.fr': { status: 503, body: '' },
    'https://rdap.nic.fr/domain/html.fr': { status: 200, body: '<html>' },
  };
  const whois = {
    'whois.iana.org io': FIXTURES.ianaIo,
    'whois.nic.io nic.io': FIXTURES.nicIo,
    'whois.nic.io busy.io': 'Error: query limit exceeded\n',
  };
  const client = createRegistryClient({
    request: async (url) => {
      urls.push(url);
      if (url.includes('down.fr')) {
        throw new Error('ECONNREFUSED');
      }
      return answers[url];
    },
    whois: async (host, query) => {
      if (!(`${host} ${query}` in whois)) {
        throw new Error('ETIMEDOUT');
      }
      return whois[`${host} ${query}`];
    },
  });
  const servers = await client.bootstrap();
  assert.equal((await client.rdap(servers.fr, 'afnic.fr')).registrar, 'Registry Operations');
  await assert.rejects(client.rdap(servers.fr, 'free.fr'), { kind: 'not_found' });
  await assert.rejects(client.rdap(servers.fr, 'busy.fr'), { kind: 'rate_limited' });
  await assert.rejects(client.rdap(servers.fr, 'broken.fr'), { kind: 'http' });
  await assert.rejects(client.rdap(servers.fr, 'html.fr'), { kind: 'invalid' });
  await assert.rejects(client.rdap(servers.fr, 'down.fr'), { kind: 'unreachable' });
  assert.equal(await client.whoisServer('io'), 'whois.nic.io');
  // The .io terms of use say "too many queries": still a valid answer.
  assert.equal(
    (await client.whois('whois.nic.io', 'nic.io')).expiresAt,
    '2027-05-01T00:00:02.000Z',
  );
  await assert.rejects(client.whois('whois.nic.io', 'busy.io'), { kind: 'rate_limited' });
  await assert.rejects(client.whois('whois.nic.io', 'other.io'), { kind: 'unreachable' });
  assert.equal(urls[0], BOOTSTRAP_URL);
});
