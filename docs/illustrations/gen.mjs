// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The `domains` widget on real answers of the registries recorded for the
// tests (test/fixtures: Verisign, Afnic, .io and .it whois, .de), at a fixed
// instant: Saturday 17 October 2026, noon in Paris. Nothing is made up but
// the instant.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDomainsWidget } = await load('src/widgets.js');
const { snapshotOf } = await load('src/device.js');
const { readRdap, readWhois } = await load('src/registry.js');
const { LANGUAGES } = await load('src/i18n.js');
const text = (path) => readFileSync(`${repo}/${path}`, 'utf8');
const json = (path) => JSON.parse(text(path));
const manifest = json('gladys-assistant-integration.json');

const NOW = Date.parse('2026-10-17T10:00:00Z');
const timezone = 'Europe/Paris';
const snap = (record) => snapshotOf(record, NOW, timezone);
const entries = [
  {
    domain: 'gladysassistant.com',
    record: readRdap(json('test/fixtures/rdap.gladysassistant.com.json')),
  },
  { domain: 'nic.it', record: readWhois(text('test/fixtures/whois.nic.it.txt')) },
  { domain: 'nic.io', record: readWhois(text('test/fixtures/whois.nic.io.txt')) },
  { domain: 'afnic.fr', record: readRdap(json('test/fixtures/rdap.afnic.fr.json')) },
].map(({ domain, record }) => ({ domain, snapshot: snap(record), error: null }));
entries.push({ domain: 'denic.de', snapshot: null, error: { kind: 'no_expiry' } });

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = { domains: buildDomainsWidget({ entries, language }) };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
