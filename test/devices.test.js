// The checks the host API and the Gladys front make on a discovered device,
// which the fake Gladys of the SDK does not all make: should_poll, min / max /
// read_only / has_feedback on every feature, and category / type pairs that
// have an icon in the front.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildDomainDevice,
  buildDomainStates,
  snapshotOf,
  daysLeft,
  stateOf,
  formatDate,
  domainFromExternalId,
  FEATURES,
  STATES,
  DAYS,
} from '../src/device.js';
import { readRdap } from '../src/registry.js';
import { LANGUAGES } from '../src/i18n.js';
import { FIXTURES, NOW, DAY, TIMEZONE, fakeGladys } from './helpers/fixtures.js';

const record = readRdap(FIXTURES.gladys);

// Pairs with an icon in front/src/utils/consts.js (Gladys master, 2026-10-17).
const ICONS = {
  [`${CATEGORIES.DURATION}/${TYPES.DURATION.INTEGER}`]: 'clock',
  [`${CATEGORIES.TEXT}/${TYPES.TEXT.TEXT}`]: 'type',
};

test('a domain device: shapes accepted by the host API, pairs with an icon', () => {
  for (const language of LANGUAGES) {
    const device = buildDomainDevice(fakeGladys, 'gladysassistant.com', language);
    assert.equal(device.external_id, 'ext:test-integration:domain:gladysassistant.com');
    assert.equal(device.name, 'gladysassistant.com');
    assert.equal(device.should_poll, false);
    assert.deepEqual(device.params, [{ name: 'DOMAIN', value: 'gladysassistant.com' }]);
    assert.equal(device.features.length, FEATURES.length);
    for (const feature of device.features) {
      for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
      }
      assert.ok(feature.min <= feature.max);
      assert.equal(feature.read_only, true);
      assert.ok(ICONS[`${feature.category}/${feature.type}`], feature.external_id);
      assert.ok(feature.name.length > 2 && feature.name.length <= 255);
    }
  }
  const days = buildDomainDevice(fakeGladys, 'example.fr').features[0];
  assert.equal(days.unit, UNITS.DAYS);
  // An internationalized domain shows its Unicode name, keeps its ASCII id.
  const idn = buildDomainDevice(fakeGladys, 'xn--caf-dma.fr');
  assert.equal(idn.name, 'café.fr');
  assert.equal(domainFromExternalId(`${idn.external_id}:days_left`), 'xn--caf-dma.fr');
  assert.equal(domainFromExternalId('ext:x:domain:example.co.uk'), 'example.co.uk');
  assert.equal(domainFromExternalId('nothing'), null);
});

test('days left follow the local day of Gladys', () => {
  assert.equal(daysLeft(record, NOW, TIMEZONE), 63);
  // 2026-12-19 at 10:31 UTC: the same day all day long in Paris.
  assert.equal(daysLeft(record, Date.parse('2026-12-19T22:59:00Z'), TIMEZONE), 0);
  assert.equal(daysLeft(record, Date.parse('2026-12-19T23:01:00Z'), TIMEZONE), -1);
  assert.equal(daysLeft({ expiresAt: null }, NOW, TIMEZONE), null);
});

test('states: registry statuses first, then the days', () => {
  assert.equal(stateOf(record, 63), STATES.ACTIVE);
  assert.equal(stateOf(record, 30), STATES.SOON);
  assert.equal(stateOf(record, -1), STATES.EXPIRED);
  assert.equal(stateOf({ statuses: ['redemption period'] }, -10), STATES.REDEMPTION);
  assert.equal(stateOf({ statuses: ['pending delete'] }, -40), STATES.PENDING_DELETE);
});

test('states published: number, texts in the language, bounded countdown', () => {
  const states = buildDomainStates(
    fakeGladys,
    'gladysassistant.com',
    snapshotOf(record, NOW, TIMEZONE),
    'fr',
  );
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').at(-1), s.state ?? s.text]),
  );
  assert.deepEqual(byKey, {
    days_left: 63,
    expiration_date: '19 décembre 2026',
    registrar: 'Cloudflare, Inc.',
    state: 'Actif',
  });
  const far = buildDomainStates(
    fakeGladys,
    'x.fr',
    snapshotOf({ ...record, expiresAt: new Date(NOW + 5000 * DAY).toISOString() }, NOW, TIMEZONE),
    'en',
  );
  assert.equal(far[0].state, DAYS.max);
  const noRegistrar = buildDomainStates(
    fakeGladys,
    'x.fr',
    snapshotOf({ ...record, registrar: null }, NOW, TIMEZONE),
    'en',
  );
  assert.equal(noRegistrar.length, FEATURES.length - 1);
  assert.equal(formatDate(null, 'en'), '?');
  assert.equal(formatDate('2026-12-19T10:31:28.000Z', 'de'), '19. Dezember 2026');
});
