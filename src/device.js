// -----------------------------------------------------------------------------
// The devices of the Whois integration: one per domain, offered on the
// Discovery screen, named after the domain ("example.fr").
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon in the Gladys front: Gladys has no domain category, the countdown
// is a `duration` / `integer` in days, the rest is text.
//
//   - days_left        days until the expiration (negative once expired)
//   - expiration_date  text: "19 December 2026"
//   - registrar        text: "Cloudflare, Inc."
//   - state            text: Active / Expires soon / Expired / Redemption
//                      period / Pending deletion
//
// External ids: the ASCII name of the domain (example.fr, xn--caf-dma.fr):
// never a display name. The registry is asked once a day and the countdown
// follows the local day of Gladys, so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { displayDomain } from './domain.js';
import { calendarDaysBetween } from './time.js';

const DEVICE_TYPE = 'domain';
// A domain is registered for ten years at most; a registry drops an expired
// one after its redemption period (about 75 days).
const DAYS = { min: -100, max: 3700 };
// Below this, the domain "expires soon" (the usual first reminder of the
// registrars).
const SOON_DAYS = 30;
const STATES = {
  ACTIVE: 'active',
  SOON: 'expiring',
  EXPIRED: 'expired',
  REDEMPTION: 'redemption',
  PENDING_DELETE: 'pending_delete',
};

const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const countdown = {
  category: CATEGORIES.DURATION,
  type: TYPES.DURATION.INTEGER,
  unit: UNITS.DAYS,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: DAYS.min,
  max: DAYS.max,
};

/**
 * @description Days from today to the expiration, in the timezone of Gladys
 * (midnight to midnight: a domain expiring tomorrow is "1 day" all day).
 * @param {object} record - The registry record.
 * @param {number} now - Now (ms).
 * @param {string} timezone - IANA timezone.
 * @returns {number|null} The days, negative once expired.
 */
function daysLeft(record, now, timezone) {
  if (!record?.expiresAt) {
    return null;
  }
  return calendarDaysBetween(new Date(record.expiresAt), new Date(now), timezone);
}

/**
 * @description The state of a domain: the registry statuses first (a domain
 * in redemption is "expired" for the user, but can still be restored).
 * @param {object} record - The registry record.
 * @param {number|null} days - daysLeft.
 * @returns {string} One of STATES.
 */
function stateOf(record, days) {
  const statuses = record?.statuses ?? [];
  if (statuses.some((status) => status.includes('pending delete'))) {
    return STATES.PENDING_DELETE;
  }
  if (statuses.some((status) => status.includes('redemption'))) {
    return STATES.REDEMPTION;
  }
  if (days !== null && days < 0) {
    return STATES.EXPIRED;
  }
  return days !== null && days <= SOON_DAYS ? STATES.SOON : STATES.ACTIVE;
}

/**
 * @description A date written the way a language does: "19 December 2026".
 * The day is read in UTC: registries give the expiration as a UTC instant,
 * and its calendar day is the one they show.
 * @param {string|null} iso - The ISO instant.
 * @param {string} language - The language.
 * @returns {string} The date, "?" when unknown.
 */
function formatDate(iso, language) {
  if (!iso) {
    return '?';
  }
  // British English: "19 December 2026", not the US month first.
  return new Date(iso).toLocaleDateString(language === 'en' ? 'en-GB' : language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The features: key, name (TEXTS key), shape and the state of a snapshot
// (a number, `{ text }`, or null when unknown: not published).
const FEATURES = [
  { key: 'days_left', name: 'featureDaysLeft', shape: countdown, state: (s) => s.days },
  {
    key: 'expiration_date',
    name: 'featureExpiration',
    shape: text,
    state: (s, language) => ({ text: formatDate(s.record.expiresAt, language) }),
  },
  {
    key: 'registrar',
    name: 'featureRegistrar',
    shape: text,
    state: (s) => (s.record.registrar ? { text: s.record.registrar.slice(0, 200) } : null),
  },
  {
    key: 'state',
    name: 'featureState',
    shape: text,
    state: (s, language) => ({ text: t(`state_${s.state}`, language) }),
  },
];

/**
 * @description The external ids of a domain device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'example.fr').device; // -> 'ext:whois:domain:example.fr'
 */
const idsOf = (gladys, domain) => gladys.externalIds(DEVICE_TYPE, domain);

/**
 * @description The domain a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @returns {string|null} The ASCII name.
 * @example
 * domainFromExternalId('ext:whois:domain:example.fr:days_left'); // -> 'example.fr'
 */
function domainFromExternalId(externalId) {
  const match = /:domain:([a-z0-9.-]+?)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The device of a domain.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {string} [language] - Language of the feature names.
 * @returns {object} The discovered device.
 */
function buildDomainDevice(gladys, domain, language = 'en') {
  const ids = idsOf(gladys, domain);
  return {
    name: displayDomain(domain),
    external_id: ids.device,
    model: 'Domain',
    should_poll: false,
    params: [{ name: 'DOMAIN', value: domain }],
    features: FEATURES.map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description What the device shows of a record at an instant.
 * @param {object} record - The registry record.
 * @param {number} now - Now (ms).
 * @param {string} timezone - IANA timezone.
 * @returns {{ record: object, days: number|null, state: string }} The snapshot.
 */
function snapshotOf(record, now, timezone) {
  const days = daysLeft(record, now, timezone);
  return { record, days, state: stateOf(record, days) };
}

/**
 * @description The states of a domain device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildDomainStates(gladys, domain, snapshot, language) {
  const ids = idsOf(gladys, domain);
  return FEATURES.flatMap((spec) => {
    const value = spec.state(snapshot, language);
    if (value === null || value === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : {
            device_feature_external_id: id,
            state: Math.min(DAYS.max, Math.max(DAYS.min, value)),
          },
    ];
  });
}

export {
  DEVICE_TYPE,
  DAYS,
  SOON_DAYS,
  STATES,
  FEATURES,
  daysLeft,
  stateOf,
  formatDate,
  idsOf,
  domainFromExternalId,
  buildDomainDevice,
  snapshotOf,
  buildDomainStates,
};
