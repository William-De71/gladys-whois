// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
//   - `domain_expiring`  the domain expires in N days or less. The filters of
//     a scene trigger compare by equality only, so each threshold is its own
//     event (`days` = "30", "14"…), fired once per expiration date. When a
//     check reaches several thresholds at once (a domain added 5 days before
//     its expiration, Gladys stopped for a week), only the most urgent one
//     is published: one message, not five.
//   - `domain_renewed`   the expiration date moved forward (the domain was
//     renewed); the thresholds start again from the new date.
//
// Event data is flat (at most 30 keys, scalar values, strings of at most
// 1,000 characters). Outputs are the declared ones only, never null: -1 for
// an unknown number, "" for an unknown text.
// -----------------------------------------------------------------------------

import { idsOf, formatDate } from './device.js';
import { displayDomain } from './domain.js';
import { t } from './i18n.js';

const TRIGGERS = { EXPIRING: 'domain_expiring', RENEWED: 'domain_renewed' };
// Days before the expiration, most distant first; 0 = the day it expires.
const THRESHOLDS = [90, 60, 30, 14, 7, 3, 1, 0];
const MAX_STRING = 1000;

const textOf = (value) => String(value ?? '').slice(0, MAX_STRING);
const numberOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : -1);

/**
 * @description The data every event and output shares.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf (device.js).
 * @param {string} language - Language of the texts.
 * @returns {object} The data.
 */
const domainData = (gladys, domain, snapshot, language) => ({
  domain: idsOf(gladys, domain).device,
  domain_name: textOf(displayDomain(domain)),
  days_left: numberOf(snapshot.days),
  expiration_date: textOf(formatDate(snapshot.record.expiresAt, language)),
  expiration_iso: textOf(snapshot.record.expiresAt),
  registrar: textOf(snapshot.record.registrar),
});

/**
 * @description A sentence about the expiration, ready for a message.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf.
 * @param {string} language - Language of the texts.
 * @returns {string} The sentence.
 */
function expirationSentence(domain, snapshot, language) {
  const values = {
    domain: displayDomain(domain),
    n: snapshot.days,
    date: formatDate(snapshot.record.expiresAt, language),
  };
  if (snapshot.days === null) {
    return t('summaryUnknown', language, values);
  }
  if (snapshot.days < 0) {
    return t('summaryExpired', language, { ...values, n: -snapshot.days });
  }
  if (snapshot.days === 0) {
    return t('summaryToday', language, values);
  }
  return t(snapshot.days === 1 ? 'summaryTomorrow' : 'summaryIn', language, values);
}

/**
 * @description The `domain_expiring` event of a domain, if a threshold not
 * fired yet is reached.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf.
 * @param {Function} isFired - `(id) => boolean`.
 * @param {string} language - Language of the texts.
 * @returns {{ ids: Array<string>, key: string, data: object }|null} The event,
 * with the ids of every threshold it settles.
 */
function expiringEvent(gladys, domain, snapshot, isFired, language) {
  if (snapshot.days === null || !snapshot.record.expiresAt) {
    return null;
  }
  const due = THRESHOLDS.filter((threshold) => snapshot.days <= threshold)
    .map((threshold) => ({ threshold, id: `${domain}:${snapshot.record.expiresAt}:${threshold}` }))
    .filter(({ id }) => !isFired(id));
  if (due.length === 0) {
    return null;
  }
  const { threshold } = due.at(-1);
  return {
    ids: due.map(({ id }) => id),
    key: TRIGGERS.EXPIRING,
    data: {
      ...domainData(gladys, domain, snapshot, language),
      days: String(threshold),
      summary: textOf(expirationSentence(domain, snapshot, language)),
    },
  };
}

/**
 * @description The `domain_renewed` event, when the expiration moved forward.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf, with the new record.
 * @param {string|null} previous - The previous expiration (ISO).
 * @param {string} language - Language of the texts.
 * @returns {{ key: string, data: object }|null} The event.
 */
function renewedEvent(gladys, domain, snapshot, previous, language) {
  const next = snapshot.record.expiresAt;
  // A day of margin: some registries move the time of day, not the date.
  if (!previous || !next || Date.parse(next) - Date.parse(previous) < 24 * 3600 * 1000) {
    return null;
  }
  const data = domainData(gladys, domain, snapshot, language);
  return {
    key: TRIGGERS.RENEWED,
    data: {
      ...data,
      previous_expiration_date: textOf(formatDate(previous, language)),
      summary: textOf(
        t('summaryRenewed', language, {
          domain: displayDomain(domain),
          date: data.expiration_date,
        }),
      ),
    },
  };
}

/**
 * @description Outputs of the `get_domain` scene action.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} domain - The ASCII name.
 * @param {object} snapshot - snapshotOf.
 * @param {string} language - Language of the texts.
 * @returns {object} The outputs.
 */
function domainOutputs(gladys, domain, snapshot, language) {
  const { domain: _device, ...data } = domainData(gladys, domain, snapshot, language);
  return {
    ...data,
    state: snapshot.state,
    summary: textOf(expirationSentence(domain, snapshot, language)),
  };
}

export { TRIGGERS, THRESHOLDS, expirationSentence, expiringEvent, renewedEvent, domainOutputs };
