// -----------------------------------------------------------------------------
// Client of the domain registries: RDAP first, whois (port 43) otherwise.
//
//   - RDAP (RFC 9082/9083) is the JSON successor of whois. The IANA publishes
//     which server answers for each top-level domain
//     (https://data.iana.org/rdap/dns.json, RFC 9224): .com, .net, .org, .fr,
//     .uk, .nl, the new gTLDs… The list is read once a week.
//   - Some country codes have no RDAP server yet (.io, .it, .de, .eu, .be,
//     .ch… in 2026): for them, the whois server of the TLD is asked to the
//     IANA (whois.iana.org, "whois:" line) once, then queried on port 43 with
//     the bare domain name, and the text answer is read with the field names
//     the registries use.
//
// Some registries publish no expiration date at all (DENIC for .de, EURid
// for .eu, DNS Belgium, SWITCH): the answer is then `no_expiry`, not an
// error of the integration.
//
// Errors carry a kind the app turns into a message: `not_found` (the domain
// is not registered), `no_expiry`, `unsupported` (no RDAP nor whois server
// for the TLD), `rate_limited`, `http`, `invalid`, `unreachable`.
// -----------------------------------------------------------------------------

import { createConnection } from 'node:net';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const IANA_WHOIS = 'whois.iana.org';
const WHOIS_PORT = 43;
const TIMEOUT_MS = 20000;
// A whois answer is a few kilobytes; stop reading a server that never ends.
const MAX_WHOIS_BYTES = 256 * 1024;
const HEADERS = {
  Accept: 'application/rdap+json, application/json',
  'User-Agent': 'gladys-whois (+https://github.com/William-De71/gladys-whois)',
};

/**
 * @description An error of a registry, with a kind the app turns into a message.
 */
class RegistryError extends Error {
  /**
   * @param {string} kind - not_found, no_expiry, unsupported, rate_limited, http, invalid, unreachable.
   * @param {string} message - The message.
   */
  constructor(kind, message) {
    super(message);
    this.name = 'RegistryError';
    this.kind = kind;
  }
}

// --- Reading the answers -------------------------------------------------------------

/**
 * @description An ISO instant out of the dates registries write: ISO 8601,
 * "2026-12-31", "2026.12.31", "31-Dec-2026", "2026-12-31 00:00:00".
 * @param {unknown} raw - The date.
 * @returns {string|null} The ISO instant, null when unreadable.
 * @example
 * readDate('2026-12-31'); // -> '2026-12-31T00:00:00.000Z'
 */
function readDate(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/\s+\(.*\)$/, '');
  if (!text) {
    return null;
  }
  let match = /^(\d{4})[-./](\d{2})[-./](\d{2})(?:$|[ T](\d{2}):(\d{2})(?::(\d{2}))?(.*)$)/.exec(
    text,
  );
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00', rest = ''] = match;
    const zone = rest.trim();
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const parsed = Date.parse(/^(Z|[+-]\d{2}:?\d{2})$/.test(zone) ? `${iso}${zone}` : `${iso}Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  match = /^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/.exec(text);
  if (match) {
    const parsed = Date.parse(`${match[1]} ${match[2]} ${match[3]} UTC`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * @description The name of the registrar entity of an RDAP answer.
 * @param {Array<object>} entities - The entities.
 * @returns {string|null} The name.
 */
function rdapRegistrar(entities) {
  const registrar = (Array.isArray(entities) ? entities : []).find((entity) =>
    entity?.roles?.includes('registrar'),
  );
  if (!registrar) {
    return null;
  }
  const card = Array.isArray(registrar.vcardArray?.[1]) ? registrar.vcardArray[1] : [];
  const fn = card.find((entry) => Array.isArray(entry) && entry[0] === 'fn');
  const name = typeof fn?.[3] === 'string' ? fn[3].trim() : '';
  return name || (typeof registrar.handle === 'string' ? registrar.handle : null);
}

/**
 * @description The record of an RDAP domain answer.
 * @param {object} json - The answer.
 * @returns {object} `{ expiresAt, registeredAt, changedAt, registrar, statuses, source }`.
 * @example
 * readRdap(JSON.parse(body));
 */
function readRdap(json) {
  if (!json || typeof json !== 'object' || json.objectClassName !== 'domain') {
    throw new RegistryError('invalid', 'RDAP answer is not a domain object');
  }
  const events = Array.isArray(json.events) ? json.events : [];
  const eventDate = (action) =>
    readDate(events.find((event) => event?.eventAction === action)?.eventDate);
  const record = {
    expiresAt: eventDate('expiration'),
    registeredAt: eventDate('registration'),
    changedAt: eventDate('last changed'),
    registrar: rdapRegistrar(json.entities),
    statuses: (Array.isArray(json.status) ? json.status : [])
      .filter((status) => typeof status === 'string')
      .map((status) => status.toLowerCase()),
    source: 'rdap',
  };
  if (!record.expiresAt) {
    throw new RegistryError('no_expiry', 'The registry publishes no expiration date');
  }
  return record;
}

// Field names of the whois answers, most specific first.
const WHOIS_FIELDS = {
  expiresAt: [
    'registry expiry date',
    'registrar registration expiration date',
    'expiration date',
    'expiry date',
    'expire date',
    'expires on',
    'expires',
    'expire',
    'paid-till',
    'valid until',
    'renewal date',
  ],
  registeredAt: ['creation date', 'created on', 'created', 'registered on', 'registered'],
  changedAt: ['updated date', 'last updated', 'last update', 'last modified', 'changed'],
  registrar: ['registrar', 'sponsoring registrar', 'registrar name'],
  status: ['domain status', 'status'],
};
const NOT_FOUND =
  /^\s*(?:no match|not found|domain not found|no data found|no entries found|status:\s*(?:free|available))\b/im;

/**
 * @description The record of a whois text answer.
 * @param {string} text - The answer.
 * @returns {object} `{ expiresAt, registeredAt, changedAt, registrar, statuses, source }`.
 * @example
 * readWhois('Registry Expiry Date: 2027-05-01T00:00:02Z\n');
 */
function readWhois(text) {
  const body = String(text ?? '');
  if (NOT_FOUND.test(body)) {
    throw new RegistryError('not_found', 'The domain is not registered');
  }
  // "Key: value" lines, the first occurrence of each key (contacts come later).
  const fields = new Map();
  const lines = body.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^\s*([A-Za-z][A-Za-z /-]*?)\s*:\s*(.*)$/.exec(line);
    if (!match || /^\s*[%#>]/.test(line)) {
      return;
    }
    const key = match[1].toLowerCase();
    let value = match[2].trim();
    // "Registrar" alone, then an indented "Organization:" (.it, .uk).
    if (!value && key === 'registrar') {
      const next = /^\s+(?:organization|name)\s*:\s*(.+)$/i.exec(lines[index + 1] ?? '');
      value = next ? next[1].trim() : '';
    }
    if (value && !fields.has(key)) {
      fields.set(key, value);
    }
  });
  if (!fields.has('registrar')) {
    const block = /^Registrar:?\s*\n\s+(?:Organization|Name)\s*:\s*(.+)$/im.exec(body);
    if (block) {
      fields.set('registrar', block[1].trim());
    }
  }
  const first = (names) => names.map((name) => fields.get(name)).find(Boolean) ?? null;
  const statuses = lines
    .map((line) => /^\s*(?:domain )?status\s*:\s*(\S+)/i.exec(line)?.[1])
    .filter(Boolean)
    .map((status) => status.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  const record = {
    expiresAt: readDate(first(WHOIS_FIELDS.expiresAt)),
    registeredAt: readDate(first(WHOIS_FIELDS.registeredAt)),
    changedAt: readDate(first(WHOIS_FIELDS.changedAt)),
    registrar: first(WHOIS_FIELDS.registrar)?.replace(/\s*\(\d+\)$/, '') ?? null,
    statuses: [...new Set(statuses)],
    source: 'whois',
  };
  if (!record.expiresAt) {
    if (fields.size < 2) {
      throw new RegistryError('invalid', 'The whois answer could not be read');
    }
    throw new RegistryError('no_expiry', 'The registry publishes no expiration date');
  }
  return record;
}

/**
 * @description The whois server of a TLD, out of the IANA whois answer.
 * @param {string} text - The answer of whois.iana.org for the TLD.
 * @returns {string|null} The server, e.g. "whois.nic.io".
 */
function readIanaWhois(text) {
  const match = /^\s*whois:\s*(\S+)\s*$/im.exec(String(text ?? ''));
  return match ? match[1].toLowerCase() : null;
}

/**
 * @description The RDAP base URL of every TLD, out of the IANA bootstrap file.
 * @param {object} json - The bootstrap file.
 * @returns {Object<string, string>} TLD -> base URL (ending with a slash).
 */
function readBootstrap(json) {
  const servers = {};
  for (const service of Array.isArray(json?.services) ? json.services : []) {
    const [tlds, urls] = Array.isArray(service) ? service : [];
    const url = (Array.isArray(urls) ? urls : []).find((u) => /^https:\/\//.test(u));
    if (!url || !Array.isArray(tlds)) {
      continue;
    }
    for (const tld of tlds) {
      servers[String(tld).toLowerCase()] = url.endsWith('/') ? url : `${url}/`;
    }
  }
  if (Object.keys(servers).length === 0) {
    throw new RegistryError('invalid', 'The IANA RDAP list is empty');
  }
  return servers;
}

// --- Transports ----------------------------------------------------------------------

/**
 * @description The default HTTP transport: fetch, with a timeout.
 * @param {string} url - The URL.
 * @returns {Promise<{ status: number, body: string }>} The answer.
 */
async function fetchRequest(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

/**
 * @description The default whois transport: one TCP query on port 43.
 * @param {string} host - The whois server.
 * @param {string} query - The query (the domain or the TLD).
 * @returns {Promise<string>} The answer.
 */
function tcpWhois(host, query) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const socket = createConnection({ host, port: WHOIS_PORT });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error(`${host} timed out`)));
    socket.on('connect', () => socket.write(`${query}\r\n`));
    socket.on('data', (chunk) => {
      size += chunk.length;
      chunks.push(chunk);
      if (size > MAX_WHOIS_BYTES) {
        socket.destroy();
      }
    });
    socket.on('error', reject);
    socket.on('close', (hadError) => {
      if (!hadError) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
  });
}

/**
 * @description Create a registry client.
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - `(url) => Promise<{ status, body }>` (tests).
 * @param {Function} [options.whois] - `(host, query) => Promise<string>` (tests).
 * @returns {object} The client: `bootstrap()`, `rdap()`, `whoisServer()`, `whois()`.
 * @example
 * const registry = createRegistryClient();
 * const servers = await registry.bootstrap();
 * const record = await registry.rdap(servers.fr, 'afnic.fr');
 */
function createRegistryClient({ request = fetchRequest, whois = tcpWhois } = {}) {
  /**
   * @description GET a JSON document, with the errors sorted.
   * @param {string} url - The URL.
   * @returns {Promise<object>} The JSON.
   */
  async function getJson(url) {
    let answer;
    try {
      answer = await request(url);
    } catch (err) {
      throw new RegistryError('unreachable', `${new URL(url).host} unreachable: ${err.message}`);
    }
    const { status, body = '' } = answer;
    if (status === 404) {
      throw new RegistryError('not_found', 'The domain is not registered');
    }
    if (status === 429) {
      throw new RegistryError('rate_limited', `${new URL(url).host} limits the requests`);
    }
    if (status < 200 || status >= 300) {
      throw new RegistryError('http', `${new URL(url).host} answered ${status}`);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new RegistryError('invalid', `${new URL(url).host} did not answer JSON`);
    }
  }

  /**
   * @description One whois query, with the errors sorted.
   * @param {string} host - The server.
   * @param {string} query - The query.
   * @returns {Promise<string>} The answer.
   */
  async function ask(host, query) {
    try {
      return await whois(host, query);
    } catch (err) {
      throw new RegistryError('unreachable', `${host} unreachable: ${err.message}`);
    }
  }

  return {
    bootstrap: async () => readBootstrap(await getJson(BOOTSTRAP_URL)),
    rdap: async (base, domain) => readRdap(await getJson(`${base}domain/${domain}`)),
    whoisServer: async (tld) => readIanaWhois(await ask(IANA_WHOIS, tld)),
    whois: async (server, domain) => {
      const text = await ask(server, domain);
      try {
        return readWhois(text);
      } catch (err) {
        // Only an answer without a date is a refusal: the terms of use of
        // many servers mention "too many queries" in every answer (.io).
        if (
          err.kind !== 'not_found' &&
          /limit exceeded|too many (?:requests|queries)|quota exceeded/i.test(text)
        ) {
          throw new RegistryError('rate_limited', `${server} limits the requests`);
        }
        throw err;
      }
    },
  };
}

export {
  BOOTSTRAP_URL,
  IANA_WHOIS,
  RegistryError,
  readDate,
  readRdap,
  readWhois,
  readIanaWhois,
  readBootstrap,
  createRegistryClient,
};
