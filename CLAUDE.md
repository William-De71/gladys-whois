# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that follows the expiration of
domain names: a Node.js service (Node 22+, ESM, no build step) that runs in
its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. Once a day per domain it asks the registry: RDAP
when the IANA lists a server for the extension (data.iana.org/rdap/dns.json),
whois on port 43 otherwise (server found through whois.iana.org). Everything
else (countdown, states, scene events) is computed locally on a quarter-hour
timer. Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/registry.test.js         # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, the quarter-hour timer, the daily check
src/registry.js         IANA lists, RDAP client, whois client (port 43), answer readers
src/domain.js           domain names: normalization (URL, www, punycode), display, TLD
src/store.js            JSON files under /data (answers, server lists, fired thresholds)
src/time.js             timezone helpers (Intl), the TZ given by the supervisor
src/device.js           one device per domain, its features, days left and state
src/events.js           scene trigger events and scene action outputs
src/widgets.js          the `domains` widget
src/config.js           configuration (domains, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real registry answers (Verisign, Afnic, .io, .it, .de) and the baseline
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  external id is the ASCII name of the domain (`example.fr`,
  `xn--caf-dma.fr`), never the Unicode display name; feature keys,
  `category` / `type` / `unit` / `min` / `max` / `step`; the keys of
  `config_schema`, `actions`, the widget, scene triggers (fields, option
  values, variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Be gentle with the registries.** One check a day per domain, at a random
  minute of the night per instance, 2 s between requests, the IANA RDAP list
  once a week, the whois server of an extension asked once and kept in
  /data. Whois servers throttle hard: never add a request per widget, per
  scene or per tick.
- **Whois answers are text.** `readWhois` reads the first `Key: value` of the
  known field names; the terms of use of many servers mention "too many
  queries" in every answer, so a refusal is only concluded when no date was
  found. Some registries publish no expiration date (.de, .eu, .be, .ch):
  `no_expiry` is an answer, not a failure, and gets no device.
- **Scene events**: one event per threshold (filters compare by equality),
  the `days` field stays required; a threshold fires once per expiration date
  (kept in `/data/fired.json`), only the most urgent one when several are
  reached at once; `domain_renewed` when the date moves forward by a day or
  more.
- **Category / type pairs** come from the SDK constants and have an icon in
  the Gladys front (`test/devices.test.js` lists them). `should_poll` stays
  false.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of the widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language. A field older cores
  do not know needs a higher `gladys_version` minimum (see `src/constants.js`
  of the integration-store). Transport: `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
