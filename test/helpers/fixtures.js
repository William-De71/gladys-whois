// Real answers of the registries, captured on 2026-10-17: RDAP of Verisign
// (gladysassistant.com) and of the Afnic (afnic.fr), whois of .io, .it (the
// contact blocks removed) and .de, the IANA RDAP list (trimmed) and the IANA
// whois answer for .io. Served through a fake client: tests never touch the
// network.

import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RegistryError,
  readBootstrap,
  readIanaWhois,
  readRdap,
  readWhois,
} from '../../src/registry.js';

const text = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(text(name));

// gladysassistant.com expires on 2026-12-19 (63 days later in Paris),
// nic.it on 2026-12-31 (75 days), afnic.fr on 2029-07-18.
const NOW = Date.parse('2026-10-17T10:00:00Z');
const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
const TIMEZONE = 'Europe/Paris';
const FIXTURES = {
  bootstrap: json('iana-dns.json'),
  gladys: json('rdap.gladysassistant.com.json'),
  afnic: json('rdap.afnic.fr.json'),
  ianaIo: text('iana.io.txt'),
  nicIo: text('whois.nic.io.txt'),
  nicIt: text('whois.nic.it.txt'),
  denic: text('whois.denic.de.txt'),
  notFound: text('whois.notfound.io.txt'),
};
const RDAP = { 'gladysassistant.com': FIXTURES.gladys, 'afnic.fr': FIXTURES.afnic };
const WHOIS = { 'nic.io': FIXTURES.nicIo, 'nic.it': FIXTURES.nicIt, 'denic.de': FIXTURES.denic };
const WHOIS_SERVERS = {
  io: readIanaWhois(FIXTURES.ianaIo),
  it: 'whois.nic.it',
  de: 'whois.denic.de',
};

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary data directory.
 * @returns {string} The path.
 */
const dataDir = () => mkdtempSync(join(tmpdir(), 'whois-'));

/**
 * @description A fake registry client on the fixtures, with switches for the
 * tests: `fail` (an error thrown by every lookup), `records` (a record or an
 * error per domain, instead of the fixtures).
 * @returns {object} The client, with `calls`.
 */
function fakeRegistry() {
  const registry = {
    calls: [],
    fail: null,
    records: {},
    async bootstrap() {
      registry.calls.push(['bootstrap']);
      return readBootstrap(FIXTURES.bootstrap);
    },
    async rdap(base, domain) {
      registry.calls.push(['rdap', base, domain]);
      return registry.answer(domain, () => {
        if (!RDAP[domain]) {
          throw new RegistryError('not_found', 'The domain is not registered');
        }
        return readRdap(RDAP[domain]);
      });
    },
    async whoisServer(tld) {
      registry.calls.push(['whoisServer', tld]);
      return WHOIS_SERVERS[tld] ?? null;
    },
    async whois(server, domain) {
      registry.calls.push(['whois', server, domain]);
      return registry.answer(domain, () => readWhois(WHOIS[domain] ?? FIXTURES.notFound));
    },
    answer(domain, read) {
      if (registry.fail) {
        throw registry.fail;
      }
      const own = registry.records[domain];
      if (own instanceof Error) {
        throw own;
      }
      return own ? structuredClone(own) : read();
    },
  };
  return registry;
}

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:test-integration:${type}:${id}`,
    feature: (key) => `ext:test-integration:${type}:${id}:${key}`,
  }),
};

export { NOW, MINUTE, DAY, TIMEZONE, FIXTURES, silent, dataDir, fakeRegistry, fakeGladys };
