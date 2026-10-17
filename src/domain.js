// -----------------------------------------------------------------------------
// Domain names: what the user types, turned into the name the registries
// know.
//
// Users paste anything: "https://www.Example.fr/contact", "exemple.fr.",
// "café.fr". The name is lowercased, stripped of a scheme, a path, a port and
// the trailing dot, converted to its ASCII form (punycode, what RDAP and
// whois expect) and checked against the label rules. A leading "www." is
// kept: it is a host of the domain, not the domain, so "www.example.fr" is
// read as "example.fr".
//
// The registrable domain is not computed (no public suffix list): a name
// under a second-level suffix ("example.co.uk") is passed as it is, and the
// registry answers for it.
// -----------------------------------------------------------------------------

import { domainToASCII, domainToUnicode } from 'node:url';

const MAX_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * @description The ASCII name of a domain typed by the user, or null when it
 * is not a domain name.
 * @param {unknown} raw - What the user typed.
 * @returns {string|null} The name, e.g. "example.fr" or "xn--caf-dma.fr".
 * @example
 * normalizeDomain('https://www.Café.fr/menu'); // -> 'xn--caf-dma.fr'
 */
function normalizeDomain(raw) {
  let name = String(raw ?? '')
    .trim()
    .toLowerCase();
  name = name.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  name = name.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (name.startsWith('www.')) {
    name = name.slice(4);
  }
  if (!name || /\s/.test(name)) {
    return null;
  }
  const ascii = domainToASCII(name);
  if (!ascii || ascii.length > MAX_LENGTH) {
    return null;
  }
  const labels = ascii.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) {
    return null;
  }
  // A top-level domain is never all digits: "192.168.1.1" is an address.
  if (/^\d+$/.test(labels.at(-1))) {
    return null;
  }
  return ascii;
}

/**
 * @description The name to show: the Unicode form of an ASCII name.
 * @param {string} ascii - The ASCII name.
 * @returns {string} The name, e.g. "café.fr".
 * @example
 * displayDomain('xn--caf-dma.fr'); // -> 'café.fr'
 */
function displayDomain(ascii) {
  return domainToUnicode(ascii) || ascii;
}

/**
 * @description The top-level domain of a name.
 * @param {string} ascii - The ASCII name.
 * @returns {string} The TLD, e.g. "fr".
 * @example
 * tldOf('example.co.uk'); // -> 'uk'
 */
function tldOf(ascii) {
  return ascii.split('.').at(-1);
}

export { MAX_LENGTH, normalizeDomain, displayDomain, tldOf };
