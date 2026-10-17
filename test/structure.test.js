// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to.
//
// test/fixtures/discovery.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would have to delete
// and recreate a device, or would lose a scene or a widget setting: never
// update the baseline without a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDomainDevice } from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));
const shape = (device) => ({
  external_id: device.external_id,
  should_poll: device.should_poll,
  params: device.params.map((param) => param.name),
  features: device.features.map(pick),
});

/**
 * @description The current state of everything stored by users.
 * @param {string} language - Language of the names.
 * @returns {object} Devices and manifest keys.
 */
function current(language = 'en') {
  return {
    devices: {
      domain: shape(buildDomainDevice(fakeGladys, 'xn--caf-dma.fr', language)),
    },
    manifest: {
      config_schema: manifest.config_schema.map(({ key, type }) => ({ key, type })),
      actions: keys(manifest.actions),
      scene_triggers: manifest.scene_triggers.map((trigger) => ({
        key: trigger.key,
        fields: trigger.fields.map((field) => ({
          key: field.key,
          options: (field.options ?? []).map((option) => option.value),
        })),
        variables: trigger.variables.map(({ key, type }) => ({ key, type })),
      })),
      scene_actions: manifest.scene_actions.map((action) => ({
        key: action.key,
        fields: keys(action.fields),
        outputs: action.outputs.map(({ key, type }) => ({ key, type })),
      })),
      widgets: manifest.widgets.map((widget) => ({
        key: widget.key,
        settings: keys(widget.settings),
      })),
    },
  };
}

export { current };

test('the devices keep their external ids and the fields Discovery compares, in every language', () => {
  for (const language of LANGUAGES) {
    assert.deepEqual(current(language).devices, baseline.devices, language);
  }
});

test('no configuration key disappears or changes type', () => {
  const now = byKey(manifest.config_schema);
  for (const { key, type } of baseline.manifest.config_schema) {
    assert.equal(now.get(key)?.type, type, `config_schema.${key}`);
  }
  assert.deepEqual(
    keys(manifest.actions).filter((key) => baseline.manifest.actions.includes(key)),
    baseline.manifest.actions,
  );
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const now = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const entry = now.get(trigger.key);
    assert.ok(entry, `scene_triggers.${trigger.key}`);
    const fields = byKey(entry.fields);
    for (const { key, options } of trigger.fields) {
      assert.ok(fields.has(key), `${trigger.key}.fields.${key}`);
      const values = (fields.get(key).options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(entry.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions and widgets keep their keys, fields, outputs and settings', () => {
  const actions = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const entry = actions.get(action.key);
    assert.ok(entry, `scene_actions.${action.key}`);
    action.fields.forEach((field) =>
      assert.ok(keys(entry.fields).includes(field), `${action.key}.${field}`),
    );
    const outputs = byKey(entry.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
  }
  const widgets = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    assert.ok(widgets.has(widget.key), `widgets.${widget.key}`);
    widget.settings.forEach((key) =>
      assert.ok(keys(widgets.get(widget.key).settings).includes(key), `${widget.key}.${key}`),
    );
  }
});
