// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake registry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, RETRY_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { RegistryError } from '../src/registry.js';
import { NOW, DAY, MINUTE, TIMEZONE, silent, dataDir, fakeRegistry } from './helpers/fixtures.js';

const GLADYS = 'ext:test-integration:domain:gladysassistant.com';
const IT = 'ext:test-integration:domain:nic.it';

/**
 * @description The integration, connected to a fake Gladys and a fake registry.
 * @param {object} [options] - `{ config, registry, dir, now, logger }`.
 * @returns {Promise<object>} `{ gladys, app, registry, clock, dir }`.
 */
async function startApp({
  config = { domains: 'gladysassistant.com, nic.it' },
  registry = fakeRegistry(),
  dir = dataDir(),
  now = NOW,
  logger = silent,
} = {}) {
  const clock = { now };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    registry,
    dataDir: dir,
    now: () => clock.now,
    sleep: async () => {},
    timezone: TIMEZONE,
    refreshMinute: 30,
    logger,
  });
  await gladys.connect();
  return { gladys, app, registry, clock, dir };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const lookups = (registry) => registry.calls.filter((call) => ['rdap', 'whois'].includes(call[0]));

test('connect: RDAP for .com, whois for .it, two devices offered, status connected', async (t) => {
  const { gladys, app, registry } = await startApp();
  t.after(() => app.stop());
  assert.deepEqual(lookups(registry), [
    ['rdap', 'https://rdap.verisign.com/com/v1/', 'gladysassistant.com'],
    ['whois', 'whois.nic.it', 'nic.it'],
  ]);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [GLADYS, IT],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.connectionStatus.message.fr, '2 domaine(s) suivi(s).');
  // Nothing published before the user creates a device.
  assert.equal(gladys.fake.states.length, 0);
  await created(gladys, GLADYS);
  assert.equal(gladys.fake.lastState(`${GLADYS}:days_left`), 63);
  assert.equal(gladys.fake.lastState(`${GLADYS}:registrar`), 'Cloudflare, Inc.');
  assert.equal(gladys.fake.lastState(`${GLADYS}:state`), 'Actif');
});

test('one check a day, after the chosen minute; the countdown moves at local midnight', async (t) => {
  const { gladys, app, registry, clock, dir } = await startApp();
  await created(gladys, GLADYS);
  assert.equal(lookups(registry).length, 2);
  // 2026-10-18 00:20 in Paris: a new day, before the 30th minute.
  clock.now = Date.parse('2026-10-17T22:20:00Z');
  await app.tick();
  assert.equal(lookups(registry).length, 2);
  assert.equal(gladys.fake.lastState(`${GLADYS}:days_left`), 62);
  clock.now = Date.parse('2026-10-17T22:31:00Z');
  await app.tick();
  assert.equal(lookups(registry).length, 4);
  app.stop();
  // A restart the same day reads /data: no request.
  const again = await startApp({ dir, now: clock.now });
  t.after(() => again.app.stop());
  assert.equal(lookups(again.registry).length, 0);
  assert.equal(again.gladys.fake.discoveredDevices.length, 2);
});

test('scene events: a threshold once, the next one later, never twice after a restart', async (t) => {
  const { gladys, app, clock, dir } = await startApp();
  const ofGladys = () =>
    eventsOf(gladys, TRIGGERS.EXPIRING).filter((e) => e.data.domain === GLADYS);
  // 63 days left at the start: "90 days or less" is already true.
  assert.deepEqual(
    ofGladys().map((e) => e.data.days),
    ['90'],
  );
  // 2026-11-20: 29 days before 2026-12-19 -> the 30-day threshold (and 60).
  clock.now = Date.parse('2026-11-20T10:00:00Z');
  await app.tick();
  assert.deepEqual(
    ofGladys().map((e) => e.data.days),
    ['90', '30'],
  );
  assert.equal(ofGladys()[1].data.days_left, 29);
  await app.tick();
  assert.equal(ofGladys().length, 2);
  app.stop();
  const again = await startApp({ dir, now: clock.now + MINUTE });
  t.after(() => again.app.stop());
  assert.equal(
    eventsOf(again.gladys, TRIGGERS.EXPIRING).filter((e) => e.data.domain === GLADYS).length,
    0,
  );
  again.clock.now = Date.parse('2026-12-12T10:00:00Z');
  await again.app.tick();
  assert.deepEqual(
    eventsOf(again.gladys, TRIGGERS.EXPIRING)
      .filter((e) => e.data.domain === GLADYS)
      .map((e) => e.data.days),
    ['7'],
  );
});

test('renewal: the date moves forward, an event, the thresholds start again', async (t) => {
  const { gladys, app, registry, clock } = await startApp();
  t.after(() => app.stop());
  const ofGladys = () =>
    eventsOf(gladys, TRIGGERS.EXPIRING).filter((e) => e.data.domain === GLADYS);
  clock.now = Date.parse('2026-12-10T10:00:00Z');
  await app.tick();
  assert.deepEqual(
    ofGladys().map((e) => e.data.days),
    ['90', '14'],
  );
  const renewed = registry.records;
  renewed['gladysassistant.com'] = {
    expiresAt: '2027-12-19T10:31:28.000Z',
    registeredAt: null,
    changedAt: null,
    registrar: 'Cloudflare, Inc.',
    statuses: [],
    source: 'rdap',
  };
  clock.now += DAY;
  await app.tick();
  const event = eventsOf(gladys, TRIGGERS.RENEWED)[0];
  assert.equal(event.data.domain, GLADYS);
  assert.equal(event.data.expiration_date, '19 décembre 2027');
  assert.equal(event.data.previous_expiration_date, '19 décembre 2026');
  // 374 days before the new date: no threshold reached, nothing more.
  assert.equal(ofGladys().length, 2);
});

test('failures: the last answer stays, retried later; final answers are no failure', async (t) => {
  const registry = fakeRegistry();
  const { gladys, app, clock } = await startApp({ registry });
  t.after(() => app.stop());
  await created(gladys, GLADYS);
  registry.fail = new RegistryError('unreachable', 'ECONNREFUSED');
  const result = await app.refresh({ force: true });
  assert.deepEqual(result.failed, ['gladysassistant.com', 'nic.it']);
  assert.equal(gladys.fake.lastState(`${GLADYS}:days_left`), 63, 'the last answer stays');
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /No answer for: gladysassistant.com, nic.it/,
  );
  assert.equal(app.refreshDue(), false, 'a retry is pending');
  clock.now += RETRY_MS[0] + MINUTE;
  registry.fail = null;
  assert.equal(app.refreshDue(), false, 'the answers of today stay');
  // A domain not registered, a registry without dates: answers, not failures.
  registry.records['nic.it'] = new RegistryError('no_expiry', 'none');
  const final = await app.refresh({ force: true });
  assert.deepEqual(final.failed, []);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /No answer for: nic.it/);
});

test('configuration: invalid entries reported, unsupported TLD, nothing configured', async (t) => {
  const { gladys, app, registry } = await startApp({
    config: { domains: 'nothing, example.zz' },
  });
  t.after(() => app.stop());
  assert.ok(registry.calls.some((call) => call[0] === 'whoisServer' && call[1] === 'zz'));
  assert.equal(app.getEntries().get('example.zz').error.kind, 'unsupported');
  assert.match(gladys.fake.connectionStatus.message.en, /Not a domain name: nothing/);
  await gladys.fake.configUpdated({ domains: '' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucun domaine configuré/);
  const ack = await gladys.fake.widgetGet(WIDGETS.DOMAINS, { language: 'fr', settings: {} });
  assert.match(ack.data.content.components[0].text, /Aucun domaine/);
});

test('widget, scene action and the language of the texts', async (t) => {
  const { gladys, app } = await startApp();
  t.after(() => app.stop());
  const ack = await gladys.fake.widgetGet(WIDGETS.DOMAINS, { language: 'de', settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const action = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DOMAIN, { domain: IT });
  assert.equal(action.success, true, action.error);
  assert.equal(action.data.outputs.days_left, 75);
  // The widget asked in German: the texts follow.
  assert.equal(action.data.outputs.expiration_date, '31. Dezember 2026');
  const first = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DOMAIN, {});
  assert.equal(first.data.outputs.domain_name, 'gladysassistant.com');
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DOMAIN, {
    domain: 'ext:test-integration:domain:other.fr',
  });
  assert.equal(bad.success, false);
});

test('configuration actions: check a domain, check now, diagnostic', async (t) => {
  const lines = [];
  const { gladys, app, registry } = await startApp({
    logger: { ...silent, info: (line) => lines.push(line) },
  });
  t.after(() => app.stop());
  const io = await gladys.fake.action(ACTIONS.CHECK_DOMAIN, { domain: 'https://www.nic.io/' });
  assert.match(
    io.data.message.en,
    /^nic\.io expires in \d+ days \(1 May 2027\)\. Registrar: .+ Source: whois\.$/,
  );
  const fr = await gladys.fake.action(ACTIONS.CHECK_DOMAIN, { domain: 'afnic.fr' });
  assert.match(fr.data.message.fr, /Source : RDAP\.$/);
  const free = await gladys.fake.action(ACTIONS.CHECK_DOMAIN, { domain: 'free-domain.fr' });
  assert.equal(free.data.message.en, 'free-domain.fr: Not registered.');
  const invalid = await gladys.fake.action(ACTIONS.CHECK_DOMAIN, { domain: 'not a domain' });
  assert.match(invalid.data.message.es, /no es un nombre de dominio/);
  const empty = await gladys.fake.action(ACTIONS.CHECK_DOMAIN, {});
  assert.match(empty.data.message.de, /zuerst/);
  const before = lookups(registry).length;
  const refresh = await gladys.fake.action(ACTIONS.REFRESH);
  assert.equal(refresh.data.message.en, '2 domain(s) checked.');
  assert.equal(lookups(registry).length, before + 2);
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.fr, /Journaux/);
  assert.ok(lines.some((line) => /Diagnostic: nic\.it: expires 2026-12-31/.test(line)));
  // The IANA whois server of .io is asked once, then kept.
  assert.equal(registry.calls.filter((call) => call[0] === 'whoisServer').length, 2);
});
