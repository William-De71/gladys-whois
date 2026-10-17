// -----------------------------------------------------------------------------
// The Whois integration: every handler, registered on a Gladys client.
//
// The expiration of domain names, from their registries:
//   - devices (device.js): one per domain, days before expiration, date,
//     registrar, state;
//   - scene triggers (events.js): the domain expires in N days or less, the
//     domain was renewed;
//   - scene action: read a domain, for a notification;
//   - dashboard widget (widgets.js): the domains, the closest expiration
//     first.
//
// Each domain is checked once a day (one RDAP or whois request, registry.js)
// and the answer kept in /data; the countdown, the states and the scene
// events are computed locally on a quarter-hour timer, so the day changes at
// local midnight. Transport: cloud (the registries, over the internet); only
// the domain names leave the network, nothing about the user.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createRegistryClient, RegistryError } from './registry.js';
import { normalizeDomain, displayDomain, tldOf } from './domain.js';
import { createStore } from './store.js';
import { resolveTimezone, localDay, zonedTime } from './time.js';
import {
  idsOf,
  domainFromExternalId,
  buildDomainDevice,
  buildDomainStates,
  snapshotOf,
} from './device.js';
import { expiringEvent, renewedEvent, domainOutputs, expirationSentence } from './events.js';
import { WIDGETS, messageContent, buildDomainsWidget } from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = { CHECK_DOMAIN: 'check_domain', REFRESH: 'refresh', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = { GET_DOMAIN: 'get_domain' };
// Language of the texts before any widget asked for one: most Gladys users
// read French.
const DEFAULT_LANGUAGE = 'fr';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// The countdown changes at midnight: a quarter of an hour is precise enough.
const TICK_MS = 15 * MINUTE;
// Pause between two requests: registries throttle bursts, whois ones most.
const REQUEST_PAUSE_MS = 2000;
// Retry delays of a failed check (unreachable, error, limited).
const RETRY_MS = [30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR];
// The IANA RDAP list changes a few times a month.
const SERVERS_MAX_AGE_MS = 7 * DAY;
// An expiration date is settled once and for all; keep the fired thresholds
// past the longest registration.
const KEEP_FIRED_MS = 11 * 365 * DAY;
// Kinds of error that are the answer of the registry, not a failure: no
// retry before the next daily check.
const FINAL_ERRORS = new Set(['not_found', 'no_expiry', 'unsupported']);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {object} [options.registry] - The registry client (tests).
 * @param {string} [options.dataDir] - Directory of the JSON files.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {string} [options.timezone] - Timezone of Gladys (tests).
 * @param {number} [options.refreshMinute] - Minutes after midnight of the daily check.
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    registry = createRegistryClient(),
    dataDir,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timezone = resolveTimezone(),
    // Spread the instances over the night: not every Gladys at 00:05.
    refreshMinute = 5 + Math.floor(Math.random() * 235),
    logger = sdkLogger,
  } = {},
) {
  const storeOptions = { logger, ...(dataDir ? { dir: dataDir } : {}) };
  const recordsStore = createStore('records.json', storeOptions);
  const serversStore = createStore('servers.json', storeOptions);
  const firedStore = createStore('fired.json', storeOptions);

  let config = normalizeConfig();
  let language = DEFAULT_LANGUAGE;
  let createdDevices = new Set();
  // domain -> { record, error: { kind, message, at } | null, day, checkedAt }
  let entries = new Map();
  // { fetchedAt, rdap: { tld: base URL }, whois: { tld: server | null } }
  let servers = { fetchedAt: 0, rdap: {}, whois: {} };
  let fired = new Map();
  let failures = 0;
  let retryAt = 0;
  let refreshing = null;
  let timer = null;
  let running = false;
  let lastStatus = null;
  let lastDiscovery = null;

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);
  const today = () => localDay(new Date(now()), timezone);
  const isCreated = (domain) => createdDevices.has(idsOf(gladys, domain).device);
  const known = () => config.domains.filter((domain) => entries.get(domain)?.record);
  const snapshot = (domain) => snapshotOf(entries.get(domain).record, now(), timezone);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The connection status of the current state.
   * @returns {Promise<void>}
   */
  async function updateStatus() {
    if (config.domains.length === 0) {
      const message =
        config.invalid.length > 0
          ? all('noteInvalid', { entries: config.invalid.join(', ') })
          : all('statusNoDomain');
      await reportStatus(false, message);
      return;
    }
    const answered = config.domains.filter((domain) => {
      const entry = entries.get(domain);
      return entry?.record || FINAL_ERRORS.has(entry?.error?.kind);
    });
    if (answered.length === 0) {
      const pending = config.domains.some((domain) => !entries.get(domain)?.error);
      await reportStatus(false, all(pending ? 'statusPending' : 'statusAllFailed'));
      return;
    }
    const failed = config.domains
      .filter((domain) => entries.get(domain)?.error)
      .map((domain) => displayDomain(domain));
    const notes = [
      ...(failed.length ? ['noteFailed'] : []),
      ...(config.invalid.length ? ['noteInvalid'] : []),
      ...(config.dropped.length ? ['noteDropped'] : []),
    ];
    const message = Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        [
          t('statusOk', l, { n: config.domains.length }),
          ...notes.map((note) =>
            t(note, l, {
              domains: failed.join(', '),
              entries: config.invalid.join(', '),
              dropped: config.dropped.join(', '),
            }),
          ),
        ]
          .join(' ')
          .slice(0, 200),
      ]),
    );
    await reportStatus(true, message);
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Publish the states of the created domain devices.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = known()
      .filter(isCreated)
      .flatMap((domain) => buildDomainStates(gladys, domain, snapshot(domain), lang));
    if (states.length > 0) {
      await gladys.publishChangedStates(states);
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  const refreshWidgets = () =>
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));

  /**
   * @description Offer the domain devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = known().map((domain) => buildDomainDevice(gladys, domain, lang));
    const signature = JSON.stringify(devices.map((d) => [d.external_id, d.features[0].name]));
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description The RDAP servers of the IANA, read again once a week (the
   * stored list is kept when the IANA cannot be reached).
   * @returns {Promise<void>}
   */
  async function refreshServers() {
    if (now() - servers.fetchedAt < SERVERS_MAX_AGE_MS) {
      return;
    }
    try {
      servers = { ...servers, fetchedAt: now(), rdap: await registry.bootstrap() };
      await serversStore.save(servers);
    } catch (err) {
      logger.warn(`RDAP server list not refreshed: ${err.message}`);
    }
  }

  /**
   * @description Ask the registry of a domain: RDAP when the IANA lists a
   * server for its TLD, whois otherwise.
   * @param {string} domain - The ASCII name.
   * @returns {Promise<object>} The record.
   */
  async function lookup(domain) {
    await refreshServers();
    const tld = tldOf(domain);
    const base = servers.rdap[tld];
    if (base) {
      return registry.rdap(base, domain);
    }
    if (!(tld in servers.whois)) {
      servers.whois[tld] = await registry.whoisServer(tld);
      await serversStore.save(servers);
    }
    const server = servers.whois[tld];
    if (!server) {
      throw new RegistryError('unsupported', `No RDAP nor whois server for .${tld}`);
    }
    return registry.whois(server, domain);
  }

  /**
   * @description Publish a scene event, logging a failure.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<boolean>} True when published.
   */
  async function publishEvent(event) {
    try {
      await gladys.publishSceneEvent(event.key, event.data);
      return true;
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${event.key}: ${err.message}`);
      return false;
    }
  }

  /**
   * @description Check the domains whose answer is not from today (or all).
   * One check at a time.
   * @param {object} [options] - Options.
   * @param {boolean} [options.force] - Check every domain again.
   * @returns {Promise<{ ok: Array<string>, failed: Array<string> }>} The result.
   */
  function refresh({ force = false } = {}) {
    if (refreshing) {
      return refreshing;
    }
    refreshing = (async () => {
      const ok = [];
      const failed = [];
      const day = today();
      const lang = textLanguage();
      const due = config.domains.filter((domain) => force || entries.get(domain)?.day !== day);
      for (const [index, domain] of due.entries()) {
        if (index > 0) {
          await sleep(REQUEST_PAUSE_MS);
        }
        const previous = entries.get(domain) ?? null;
        try {
          const record = await lookup(domain);
          entries.set(domain, { record, error: null, day, checkedAt: now() });
          ok.push(domain);
          logger.info(`${domain}: expires ${record.expiresAt} (${record.source})`);
          const renewed = renewedEvent(
            gladys,
            domain,
            snapshot(domain),
            previous?.record?.expiresAt ?? null,
            lang,
          );
          if (renewed) {
            await publishEvent(renewed);
          }
        } catch (err) {
          const kind = err.kind ?? 'invalid';
          const error = { kind, message: err.message, at: now() };
          if (FINAL_ERRORS.has(kind)) {
            // The registry answered: no domain (any more), or no date to show.
            entries.set(domain, { record: null, error, day, checkedAt: now() });
          } else {
            // A failure: the last answer stays valid, a retry comes later.
            entries.set(domain, { ...(previous ?? { record: null }), error, day: previous?.day });
            failed.push(domain);
          }
          logger.warn(`${domain} not checked: ${err.message}`);
        }
      }
      if (failed.length > 0) {
        retryAt = now() + RETRY_MS[Math.min(failures, RETRY_MS.length - 1)];
        failures += 1;
      } else {
        failures = 0;
        retryAt = 0;
      }
      if (due.length > 0) {
        await recordsStore.save(Object.fromEntries(entries));
        await publishDiscoveredDevices().catch((err) =>
          logger.warn(`Unable to offer the devices: ${err.message}`),
        );
        await publishQuietly();
        await fireEvents();
        refreshWidgets();
      }
      await updateStatus();
      return { ok, failed };
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /**
   * @description Whether the daily check is due: an answer not from today,
   * past the minute of the day picked for this instance (right away for a
   * domain never checked), no retry pending.
   * @returns {boolean} True when due.
   */
  function refreshDue() {
    const at = now();
    if (at < retryAt) {
      return false;
    }
    const day = today();
    return config.domains.some((domain) => {
      const entry = entries.get(domain);
      if (!entry?.day) {
        return true;
      }
      if (entry.day === day) {
        return false;
      }
      return (at - zonedTime(day, 0, timezone).getTime()) / MINUTE >= refreshMinute;
    });
  }

  /**
   * @description Publish the `domain_expiring` events reached and not fired yet.
   * @returns {Promise<number>} How many were published.
   */
  async function fireEvents() {
    const lang = textLanguage();
    let count = 0;
    for (const domain of known()) {
      const event = expiringEvent(gladys, domain, snapshot(domain), (id) => fired.has(id), lang);
      if (event && (await publishEvent(event))) {
        event.ids.forEach((id) => fired.set(id, now()));
        count += 1;
      }
    }
    if (count > 0) {
      for (const [id, time] of fired) {
        if (time < now() - KEEP_FIRED_MS) {
          fired.delete(id);
        }
      }
      await firedStore.save(Object.fromEntries(fired));
    }
    return count;
  }

  /**
   * @description One quarter of an hour: states, events, daily check.
   * @returns {Promise<void>}
   */
  async function tick() {
    await publishQuietly();
    await fireEvents().catch((err) => logger.warn(`Scene events: ${err.message}`));
    if (refreshDue()) {
      await refresh();
    }
  }

  /**
   * @description Wait for the next quarter of an hour (plus one second), then tick.
   */
  function schedule() {
    clearTimeout(timer);
    if (!running) {
      return;
    }
    const delay = TICK_MS - (now() % TICK_MS) + 1000;
    timer = setTimeout(() => {
      tick()
        .catch((err) => logger.warn(`Tick: ${err.message}`))
        .finally(schedule);
    }, delay);
    timer.unref?.();
  }

  /**
   * @description The domain a field points to: a device external id, else
   * the first domain of the configuration when the field is empty.
   * @param {unknown} value - The field value.
   * @returns {string|null} The ASCII name.
   */
  function domainOfField(value) {
    if (!value) {
      return config.domains[0] ?? null;
    }
    const domain = domainFromExternalId(value);
    return domain && config.domains.includes(domain) ? domain : null;
  }

  // --- Dashboard widget --------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.DOMAINS, async ({ language: lang }) => {
    rememberLanguage(lang);
    if (config.domains.length === 0) {
      return messageContent(t('noDomain', lang));
    }
    return buildDomainsWidget({
      entries: config.domains.map((domain) => {
        const entry = entries.get(domain);
        return {
          domain,
          snapshot: entry?.record ? snapshot(domain) : null,
          error: entry?.error ?? null,
        };
      }),
      language: lang,
    });
  });

  // --- Scene action ------------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_DOMAIN, async (fields = {}) => {
    const domain = domainOfField(fields.domain);
    if (!domain) {
      throw new Error(`Unknown domain: ${fields.domain ?? '(none configured)'}`);
    }
    if (!entries.get(domain)?.record) {
      await refresh();
    }
    const entry = entries.get(domain);
    if (!entry?.record) {
      throw new Error(`${domain}: ${entry?.error?.message ?? 'no answer from its registry'}`);
    }
    return domainOutputs(gladys, domain, snapshot(domain), textLanguage());
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.CHECK_DOMAIN, async (fields = {}) => {
    const entry = String(fields.domain ?? '').trim();
    if (!entry) {
      return all('checkEmpty');
    }
    const domain = normalizeDomain(entry);
    if (!domain) {
      return all('checkInvalid', { entry: entry.slice(0, 80) });
    }
    try {
      const record = await lookup(domain);
      const view = snapshotOf(record, now(), timezone);
      return Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          t('checkResult', l, {
            summary: expirationSentence(domain, view, l),
            registrar: record.registrar ?? '?',
            source: record.source === 'rdap' ? 'RDAP' : 'whois',
          }).slice(0, 200),
        ]),
      );
    } catch (err) {
      return Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          t('checkFailed', l, {
            domain: displayDomain(domain),
            reason: t(`error_${err.kind ?? 'invalid'}`, l),
          }),
        ]),
      );
    }
  });

  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (config.domains.length === 0) {
      return all('statusNoDomain');
    }
    retryAt = 0;
    const { ok, failed } = await refresh({ force: true });
    if (failed.length === 0) {
      return all('refreshOk', { n: config.domains.length });
    }
    return all('refreshFailed', {
      ok: ok.length,
      domains: failed.map(displayDomain).join(', '),
    });
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    // Gladys does not pass DEBUG to the container: the details go to the
    // Logs tab, at the info level, on demand.
    const lines = [
      `timezone=${timezone} today=${today()} language=${textLanguage()} daily check at +${refreshMinute} min`,
      `RDAP servers: ${Object.keys(servers.rdap).length} TLDs (${servers.fetchedAt ? new Date(servers.fetchedAt).toISOString() : 'never read'}); whois servers: ${
        Object.entries(servers.whois)
          .map(([tld, server]) => `.${tld}=${server ?? 'none'}`)
          .join(' ') || 'none'
      }`,
      `invalid entries: ${config.invalid.join(' | ') || 'none'}; ignored: ${config.dropped.join(' | ') || 'none'}`,
      ...config.domains.map((domain) => {
        const entry = entries.get(domain);
        const record = entry?.record;
        return `${domain}: ${record ? `expires ${record.expiresAt}, ${record.source}, statuses ${record.statuses.join('/') || '-'}` : 'no record'}${entry?.day ? `, checked ${entry.day}` : ''}${entry?.error ? `, last error ${entry.error.kind}: ${entry.error.message}` : ''}${isCreated(domain) ? ', device created' : ''}`;
      }),
      `scene thresholds fired: ${fired.size}; next retry: ${retryAt ? new Date(retryAt).toISOString() : 'none'}`,
    ];
    lines.forEach((line) => logger.info(`Diagnostic: ${line}`));
    return all('diagnosticDone', { n: config.domains.length });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    retryAt = 0;
    await refresh();
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} domain device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read what /data kept: answers, server list, fired thresholds.
   * @returns {Promise<void>}
   */
  async function loadStores() {
    const storedServers = await serversStore.load(null);
    if (storedServers && typeof storedServers === 'object') {
      servers = {
        fetchedAt: Number(storedServers.fetchedAt) || 0,
        rdap:
          storedServers.rdap && typeof storedServers.rdap === 'object' ? storedServers.rdap : {},
        whois:
          storedServers.whois && typeof storedServers.whois === 'object' ? storedServers.whois : {},
      };
    }
    const storedRecords = await recordsStore.load({});
    entries = new Map(
      Object.entries(
        storedRecords && typeof storedRecords === 'object' ? storedRecords : {},
      ).filter(([, value]) => value && typeof value === 'object' && (value.record || value.error)),
    );
    const storedFired = await firedStore.load({});
    fired = new Map(
      Object.entries(storedFired && typeof storedFired === 'object' ? storedFired : {}).filter(
        ([, time]) => Number.isFinite(time),
      ),
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: ${config.domains.join(', ') || 'no domain'}`);
    lastDiscovery = null;
    retryAt = 0;
    failures = 0;
    await updateStatus();
    await refresh();
    await publishDiscoveredDevices().catch(() => {});
    refreshWidgets();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  gladys.on('connected', async () => {
    await loadStores();
    await loadConfig();
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await updateStatus();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await tick();
    if (!running) {
      running = true;
      schedule();
    }
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    running = false;
    clearTimeout(timer);
  });

  return {
    tick,
    refresh,
    fireEvents,
    refreshDue,
    lookup,
    getConfig: () => config,
    getEntries: () => entries,
    getFired: () => fired,
    stop: () => {
      running = false;
      clearTimeout(timer);
    },
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, DEFAULT_LANGUAGE, RETRY_MS, TICK_MS };
