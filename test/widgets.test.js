// The widget content through validateWidgetContent (the checks of the core,
// which only run in debug mode in production) and the content budget of a
// card, in the four languages and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { buildDomainsWidget, messageContent, daysColor, LIST_ITEMS } from '../src/widgets.js';
import { snapshotOf } from '../src/device.js';
import { readRdap, readWhois } from '../src/registry.js';
import { LANGUAGES } from '../src/i18n.js';
import { FIXTURES, NOW, DAY, TIMEZONE } from './helpers/fixtures.js';

const types = (content) => content.components.map((component) => component.type);
const snap = (record) => snapshotOf(record, NOW, TIMEZONE);
const ENTRIES = [
  { domain: 'afnic.fr', snapshot: snap(readRdap(FIXTURES.afnic)), error: null },
  { domain: 'nic.it', snapshot: snap(readWhois(FIXTURES.nicIt)), error: null },
  { domain: 'gladysassistant.com', snapshot: snap(readRdap(FIXTURES.gladys)), error: null },
  { domain: 'denic.de', snapshot: null, error: { kind: 'no_expiry' } },
];

/**
 * @description Assert a content is valid and within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (list) => types(content).filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['text']) <= 2, label);
}

test('domains: the closest expiration first, the unanswered ones last, in four languages', () => {
  for (const language of LANGUAGES) {
    const content = buildDomainsWidget({ entries: ENTRIES, language });
    assertValid(content, language);
    const list = content.components.find((c) => c.type === 'card-list');
    assert.deepEqual(
      list.items.map((item) => item.title),
      ['gladysassistant.com', 'nic.it', 'afnic.fr', 'denic.de'],
    );
    assert.equal(list.items[3].badge.text, '?');
  }
  const fr = buildDomainsWidget({ entries: ENTRIES, language: 'fr' });
  const list = fr.components.find((c) => c.type === 'card-list');
  assert.equal(list.items[0].badge.text, '63 j');
  assert.equal(list.items[0].subtitle, '19 décembre 2026 · Cloudflare, Inc.');
  assert.equal(list.items[3].subtitle, 'Le registre ne publie pas la date d’expiration');
  const tiles = fr.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [4, 63],
  );
});

test('domains: expired, more than eight, none, waiting', () => {
  const expired = snapshotOf(
    { ...readRdap(FIXTURES.gladys), expiresAt: new Date(NOW - 3 * DAY).toISOString() },
    NOW,
    TIMEZONE,
  );
  const content = buildDomainsWidget({
    entries: [{ domain: 'old.fr', snapshot: expired, error: null }],
    language: 'en',
  });
  assertValid(content, 'expired');
  assert.equal(
    content.components.find((c) => c.type === 'card-list').items[0].badge.text,
    'Expired',
  );
  const many = Array.from({ length: 10 }, (_, i) => ({
    domain: `d${i}.fr`,
    snapshot: null,
    error: null,
  }));
  const full = buildDomainsWidget({ entries: many, language: 'es' });
  assertValid(full, 'many');
  assert.equal(full.components.find((c) => c.type === 'card-list').items.length, LIST_ITEMS);
  assertValid(buildDomainsWidget({ entries: [], language: 'de' }), 'none');
  assertValid(messageContent('x'.repeat(400)), 'message');
  assert.deepEqual(
    [daysColor(null), daysColor(3), daysColor(20), daysColor(200)],
    ['neutral', 'danger', 'warning', 'success'],
  );
});
