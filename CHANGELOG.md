# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-17

### Added

- The expiration of up to ten domain names, typed as names or web addresses, checked once a day with their registry: RDAP (.com, .net, .org, .fr, .uk, .nl, the new extensions…), or whois for the extensions without RDAP (.io, .it…), with no account and no key.
- A device per domain: days before expiration, expiration date, registrar and state (active, expires soon, expired, redemption period, pending deletion).
- Scene triggers: the domain expires in 90, 60, 30, 14, 7, 3 or 1 day or less, or on the day; the domain was renewed.
- Scene action: read the expiration of a domain, with a summary ready for a message.
- Dashboard widget: the domains, the closest expiration first, with the days left.
- "Check a domain", "Check now" and "Diagnostic" buttons; answers and fired thresholds kept in /data, so a restart neither asks the registries again nor repeats a scene.
- English, French, German and Spanish everywhere: settings, devices, widget, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-whois/releases/tag/v0.1.0
