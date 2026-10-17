// -----------------------------------------------------------------------------
// Configuration of the Whois integration.
//
// Fields of the config_schema:
//   - `domains`   the domain names to follow, separated by commas, spaces or
//                 new lines ("example.com, example.fr"); a URL or a "www."
//                 host is accepted and reduced to the domain (domain.js);
//   - `language`  language of the texts Gladys does not ask for in a
//                 language (device and feature names, text states, scene
//                 summaries): `auto` follows the language of the last widget
//                 request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`  language of the last widget request, kept for the
//                      texts after a restart.
// -----------------------------------------------------------------------------

import { normalizeDomain } from './domain.js';
import { isLanguage } from './i18n.js';

// Each domain costs one request a day to its registry, and a device.
const MAX_DOMAINS = 10;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Split the `domains` field: commas, semicolons, spaces or new lines.
 * @param {unknown} raw - What the user typed.
 * @returns {Array<string>} The entries, trimmed, without empty ones.
 * @example
 * splitDomains('example.com; example.fr'); // -> ['example.com', 'example.fr']
 */
function splitDomains(raw) {
  return (typeof raw === 'string' ? raw : '')
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ domains: Array<string>, invalid: Array<string>, dropped: Array<string>, language: string }}
 * The domains (ASCII, without duplicates, MAX_DOMAINS at most), the entries
 * that are not domain names, the ones beyond the limit, and the language.
 * @example
 * normalizeConfig({ domains: 'example.com, https://www.example.fr/' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const domains = [];
  const invalid = [];
  for (const entry of splitDomains(config.domains)) {
    const domain = normalizeDomain(entry);
    if (!domain) {
      invalid.push(entry);
    } else if (!domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return {
    domains: domains.slice(0, MAX_DOMAINS),
    invalid,
    dropped: domains.slice(MAX_DOMAINS),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export { MAX_DOMAINS, AUTO_LANGUAGE, INTERNAL_KEYS, splitDomains, normalizeConfig, readLanguage };
