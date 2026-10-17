// -----------------------------------------------------------------------------
// Dashboard widget of the Whois integration.
//
//   - `domains`  the followed domains, the closest expiration first: the
//                days left as a colored badge, the expiration date and the
//                registrar; two tiles on top (how many domains, the next
//                expiration); a domain the registry could not answer for is
//                listed with the reason.
//
// The content comes from the answers kept in memory: a widget never costs a
// registry request. Every text exists in the four languages (the content is
// cached per language). Budget of a card: 8 components, 1 main one
// (card-list, 8 items in a list), 6 tiles, 2 texts.
// -----------------------------------------------------------------------------

import { t } from './i18n.js';
import { displayDomain } from './domain.js';
import { SOON_DAYS, STATES, formatDate } from './device.js';

const WIDGETS = { DOMAINS: 'domains' };
const LIST_ITEMS = 8;
const TTL = { message: 60, domains: 900 };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The color of a number of days left.
 * @param {number|null} days - The days.
 * @returns {string} A semantic color.
 */
function daysColor(days) {
  if (typeof days !== 'number') {
    return 'neutral';
  }
  if (days <= 7) {
    return 'danger';
  }
  return days <= SOON_DAYS ? 'warning' : 'success';
}

/**
 * @description The badge text of a number of days left: "64 d", "Expired".
 * @param {number} days - The days.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const daysBadge = (days, language) =>
  clip(days < 0 ? t('badgeExpired', language) : t('badgeDays', language, { n: days }), 16);

/**
 * @description The followed domains.
 * @param {object} options - Options.
 * @param {Array<{ domain: string, snapshot: object|null, error: object|null }>} options.entries
 * The domains, with their snapshot (device.js) or their last error.
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 */
function buildDomainsWidget({ entries, language }) {
  if (entries.length === 0) {
    return messageContent(t('noDomain', language));
  }
  const known = entries
    .filter((entry) => entry.snapshot && entry.snapshot.days !== null)
    .sort((a, b) => a.snapshot.days - b.snapshot.days);
  const unknown = entries.filter((entry) => !entry.snapshot || entry.snapshot.days === null);
  const items = [
    ...known.map(({ domain, snapshot }) => ({
      title: clip(displayDomain(domain), 60),
      subtitle: clip(
        snapshot.state === STATES.REDEMPTION || snapshot.state === STATES.PENDING_DELETE
          ? t(`state_${snapshot.state}`, language)
          : t('cardSubtitle', language, {
              date: formatDate(snapshot.record.expiresAt, language),
              registrar: snapshot.record.registrar ?? '?',
            }),
        60,
      ),
      badge: { text: daysBadge(snapshot.days, language), color: daysColor(snapshot.days) },
    })),
    ...unknown.map(({ domain, error }) => ({
      title: clip(displayDomain(domain), 60),
      subtitle: clip(t(`error_${error?.kind ?? 'pending'}`, language), 60),
      badge: { text: '?', color: 'neutral' },
    })),
  ].slice(0, LIST_ITEMS);
  const next = known[0];
  const components = [
    {
      type: 'value',
      value: entries.length,
      label: t('tileDomains', language),
      icon: 'globe',
    },
  ];
  if (next) {
    components.push({
      type: 'value',
      value: next.snapshot.days < 0 ? t('badgeExpired', language) : next.snapshot.days,
      ...(next.snapshot.days < 0 ? {} : { unit: t('unitDays', language) }),
      label: t('tileNext', language),
      icon: 'calendar',
      color: daysColor(next.snapshot.days),
    });
  }
  components.push(
    { type: 'card-list', display: 'list', items },
    { type: 'text', variant: 'caption', text: t('caption', language) },
  );
  return { ttl_seconds: TTL.domains, components };
}

export { WIDGETS, LIST_ITEMS, TTL, clip, messageContent, daysColor, buildDomainsWidget };
