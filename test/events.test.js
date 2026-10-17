import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expiringEvent, renewedEvent, domainOutputs, THRESHOLDS, TRIGGERS } from '../src/events.js';
import { snapshotOf } from '../src/device.js';
import { readRdap } from '../src/registry.js';
import { FIXTURES, NOW, DAY, TIMEZONE, fakeGladys } from './helpers/fixtures.js';

const record = readRdap(FIXTURES.gladys);
const at = (days) => snapshotOf(record, Date.parse(record.expiresAt) - days * DAY, TIMEZONE);
const never = () => false;

test('expiring: the most urgent threshold reached, settling the ones above', () => {
  const event = expiringEvent(fakeGladys, 'gladysassistant.com', at(20), never, 'en');
  assert.equal(event.key, TRIGGERS.EXPIRING);
  assert.equal(event.data.days, '30');
  assert.deepEqual(
    event.ids,
    [90, 60, 30].map((n) => `gladysassistant.com:${record.expiresAt}:${n}`),
  );
  assert.equal(event.data.domain, 'ext:test-integration:domain:gladysassistant.com');
  assert.equal(event.data.days_left, 20);
  assert.equal(event.data.summary, 'gladysassistant.com expires in 20 days (19 December 2026).');
  // Nothing reached 100 days before.
  assert.equal(expiringEvent(fakeGladys, 'gladysassistant.com', at(100), never, 'en'), null);
});

test('expiring: fired thresholds are not fired again; the next one comes', () => {
  const fired = new Set();
  const isFired = (id) => fired.has(id);
  const first = expiringEvent(fakeGladys, 'a.fr', at(14), isFired, 'fr');
  first.ids.forEach((id) => fired.add(id));
  assert.equal(first.data.days, '14');
  assert.equal(expiringEvent(fakeGladys, 'a.fr', at(10), isFired, 'fr'), null);
  const next = expiringEvent(fakeGladys, 'a.fr', at(7), isFired, 'fr');
  assert.equal(next.data.days, '7');
  assert.equal(next.ids.length, 1);
});

test('expiring: today, tomorrow, expired; every threshold is a string option', () => {
  assert.match(expiringEvent(fakeGladys, 'a.fr', at(1), never, 'en').data.summary, /tomorrow/);
  const today = expiringEvent(fakeGladys, 'a.fr', at(0), never, 'fr');
  assert.equal(today.data.days, '0');
  assert.match(today.data.summary, /aujourd’hui/);
  const late = expiringEvent(fakeGladys, 'a.fr', at(-3), never, 'de');
  assert.equal(late.data.days, '0');
  assert.match(late.data.summary, /seit 3 Tagen/);
  assert.deepEqual(
    THRESHOLDS,
    [...THRESHOLDS].sort((a, b) => b - a),
  );
});

test('renewed: only when the date moves forward by a day or more', () => {
  const later = snapshotOf({ ...record, expiresAt: '2027-12-19T10:31:28.000Z' }, NOW, TIMEZONE);
  const event = renewedEvent(fakeGladys, 'a.fr', later, record.expiresAt, 'fr');
  assert.equal(event.key, TRIGGERS.RENEWED);
  assert.equal(event.data.previous_expiration_date, '19 décembre 2026');
  assert.equal(event.data.expiration_date, '19 décembre 2027');
  assert.match(event.data.summary, /renouvelé/);
  assert.equal(renewedEvent(fakeGladys, 'a.fr', later, null, 'fr'), null);
  const sameDay = snapshotOf({ ...record, expiresAt: '2026-12-19T12:00:00.000Z' }, NOW, TIMEZONE);
  assert.equal(renewedEvent(fakeGladys, 'a.fr', sameDay, record.expiresAt, 'fr'), null);
});

test('scene action outputs: declared keys only, no null', () => {
  const outputs = domainOutputs(
    fakeGladys,
    'gladysassistant.com',
    snapshotOf(record, NOW, TIMEZONE),
    'en',
  );
  assert.deepEqual(Object.keys(outputs).sort(), [
    'days_left',
    'domain_name',
    'expiration_date',
    'expiration_iso',
    'registrar',
    'state',
    'summary',
  ]);
  assert.equal(outputs.state, 'active');
  assert.ok(Object.values(outputs).every((value) => value !== null && value !== undefined));
  const unknown = domainOutputs(
    fakeGladys,
    'x.fr',
    snapshotOf({ ...record, expiresAt: null, registrar: null }, NOW, TIMEZONE),
    'en',
  );
  assert.equal(unknown.days_left, -1);
  assert.equal(unknown.registrar, '');
  assert.match(unknown.summary, /unknown/);
});
