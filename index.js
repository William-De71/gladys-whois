// -----------------------------------------------------------------------------
// Entry point of the Whois integration.
//
// Follows the expiration of domain names in Gladys, from their registries
// (RDAP, or whois for the extensions without RDAP):
//   - devices: one per domain (days before expiration, date, registrar,
//     state), offered on the Discovery screen (see src/device.js);
//   - scene triggers: the domain expires in N days or less, the domain was
//     renewed;
//   - scene action: read a domain;
//   - dashboard widget: the domains, the closest expiration first.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the local day of the countdown)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Whois integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
