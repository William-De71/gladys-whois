// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, text states, widget contents, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo, scène / Szene / escena) and of the
// registrars: nom de domaine / Domain / dominio, bureau d'enregistrement is
// left as "registrar", the word every registrar uses.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  featureDaysLeft: {
    en: 'Days before expiration',
    fr: 'Jours avant expiration',
    de: 'Tage bis zum Ablauf',
    es: 'Días antes de la caducidad',
  },
  featureExpiration: {
    en: 'Expiration date',
    fr: 'Date d’expiration',
    de: 'Ablaufdatum',
    es: 'Fecha de caducidad',
  },
  featureRegistrar: { en: 'Registrar', fr: 'Registrar', de: 'Registrar', es: 'Registrador' },
  featureState: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  state_active: { en: 'Active', fr: 'Actif', de: 'Aktiv', es: 'Activo' },
  state_expiring: {
    en: 'Expires soon',
    fr: 'Expire bientôt',
    de: 'Läuft bald ab',
    es: 'Caduca pronto',
  },
  state_expired: { en: 'Expired', fr: 'Expiré', de: 'Abgelaufen', es: 'Caducado' },
  state_redemption: {
    en: 'Redemption period',
    fr: 'Période de rédemption',
    de: 'Wiederherstellungsfrist',
    es: 'Periodo de redención',
  },
  state_pending_delete: {
    en: 'Pending deletion',
    fr: 'Suppression imminente',
    de: 'Löschung steht bevor',
    es: 'Pendiente de eliminación',
  },

  // scene summaries
  summaryIn: {
    en: '{domain} expires in {n} days ({date}).',
    fr: '{domain} expire dans {n} jours ({date}).',
    de: '{domain} läuft in {n} Tagen ab ({date}).',
    es: '{domain} caduca en {n} días ({date}).',
  },
  summaryTomorrow: {
    en: '{domain} expires tomorrow ({date}).',
    fr: '{domain} expire demain ({date}).',
    de: '{domain} läuft morgen ab ({date}).',
    es: '{domain} caduca mañana ({date}).',
  },
  summaryToday: {
    en: '{domain} expires today ({date}).',
    fr: '{domain} expire aujourd’hui ({date}).',
    de: '{domain} läuft heute ab ({date}).',
    es: '{domain} caduca hoy ({date}).',
  },
  summaryExpired: {
    en: '{domain} expired {n} days ago ({date}).',
    fr: '{domain} a expiré il y a {n} jours ({date}).',
    de: '{domain} ist seit {n} Tagen abgelaufen ({date}).',
    es: '{domain} caducó hace {n} días ({date}).',
  },
  summaryUnknown: {
    en: 'The expiration date of {domain} is unknown.',
    fr: 'La date d’expiration de {domain} est inconnue.',
    de: 'Das Ablaufdatum von {domain} ist unbekannt.',
    es: 'La fecha de caducidad de {domain} es desconocida.',
  },
  summaryRenewed: {
    en: '{domain} was renewed: it now expires on {date}.',
    fr: '{domain} a été renouvelé : il expire désormais le {date}.',
    de: '{domain} wurde verlängert: läuft jetzt am {date} ab.',
    es: '{domain} se ha renovado: ahora caduca el {date}.',
  },

  // widget
  noDomain: {
    en: 'No domain to follow: add one in the configuration of the Whois integration.',
    fr: 'Aucun domaine à suivre : ajoutez-en un dans la configuration de l’intégration Whois.',
    de: 'Keine Domain zu überwachen: Fügen Sie eine in der Konfiguration der Whois-Integration hinzu.',
    es: 'Ningún dominio que seguir: añada uno en la configuración de la integración Whois.',
  },
  cardSubtitle: {
    en: '{date} · {registrar}',
    fr: '{date} · {registrar}',
    de: '{date} · {registrar}',
    es: '{date} · {registrar}',
  },
  badgeDays: { en: '{n} d', fr: '{n} j', de: '{n} T', es: '{n} d' },
  badgeExpired: { en: 'Expired', fr: 'Expiré', de: 'Abgelaufen', es: 'Caducado' },
  unitDays: { en: 'd', fr: 'j', de: 'T', es: 'd' },
  tileDomains: { en: 'Domains', fr: 'Domaines', de: 'Domains', es: 'Dominios' },
  tileNext: {
    en: 'Next expiration',
    fr: 'Prochaine expiration',
    de: 'Nächster Ablauf',
    es: 'Próxima caducidad',
  },
  caption: {
    en: 'RDAP or whois, checked once a day',
    fr: 'RDAP ou whois, vérifié une fois par jour',
    de: 'RDAP oder Whois, täglich geprüft',
    es: 'RDAP o whois, revisado una vez al día',
  },

  // errors of a domain
  error_not_found: {
    en: 'Not registered',
    fr: 'Non enregistré',
    de: 'Nicht registriert',
    es: 'No registrado',
  },
  error_no_expiry: {
    en: 'The registry does not publish the expiration date',
    fr: 'Le registre ne publie pas la date d’expiration',
    de: 'Die Registry veröffentlicht kein Ablaufdatum',
    es: 'El registro no publica la fecha de caducidad',
  },
  error_unsupported: {
    en: 'No RDAP or whois server for this extension',
    fr: 'Aucun serveur RDAP ni whois pour cette extension',
    de: 'Kein RDAP- oder Whois-Server für diese Endung',
    es: 'Ningún servidor RDAP ni whois para esta extensión',
  },
  error_rate_limited: {
    en: 'The registry limits the requests: new try later',
    fr: 'Le registre limite les requêtes : nouvel essai plus tard',
    de: 'Die Registry begrenzt die Anfragen: später erneut',
    es: 'El registro limita las solicitudes: nuevo intento luego',
  },
  error_http: {
    en: 'The registry answered with an error',
    fr: 'Le registre a répondu par une erreur',
    de: 'Die Registry hat mit einem Fehler geantwortet',
    es: 'El registro respondió con un error',
  },
  error_invalid: {
    en: 'The answer of the registry could not be read',
    fr: 'La réponse du registre est illisible',
    de: 'Die Antwort der Registry ist nicht lesbar',
    es: 'La respuesta del registro no se pudo leer',
  },
  error_unreachable: {
    en: 'The registry cannot be reached',
    fr: 'Le registre est injoignable',
    de: 'Die Registry ist nicht erreichbar',
    es: 'No se puede acceder al registro',
  },
  error_pending: {
    en: 'Waiting for the first check…',
    fr: 'En attente de la première vérification…',
    de: 'Warten auf die erste Prüfung…',
    es: 'Esperando la primera comprobación…',
  },

  // connection status
  statusNoDomain: {
    en: 'No domain configured: type one or more domain names.',
    fr: 'Aucun domaine configuré : saisissez un ou plusieurs noms de domaine.',
    de: 'Keine Domain konfiguriert: Geben Sie einen oder mehrere Domainnamen ein.',
    es: 'Ningún dominio configurado: escriba uno o varios nombres de dominio.',
  },
  statusPending: {
    en: 'Checking the domains with their registries…',
    fr: 'Vérification des domaines auprès de leurs registres…',
    de: 'Die Domains werden bei ihren Registries geprüft…',
    es: 'Comprobando los dominios con sus registros…',
  },
  statusAllFailed: {
    en: 'No registry answered: check the internet access of Gladys.',
    fr: 'Aucun registre n’a répondu : vérifiez l’accès à Internet de Gladys.',
    de: 'Keine Registry hat geantwortet: Prüfen Sie den Internetzugang von Gladys.',
    es: 'Ningún registro respondió: compruebe el acceso a Internet de Gladys.',
  },
  statusOk: {
    en: '{n} domain(s) followed.',
    fr: '{n} domaine(s) suivi(s).',
    de: '{n} Domain(s) überwacht.',
    es: '{n} dominio(s) seguido(s).',
  },
  noteFailed: {
    en: 'No answer for: {domains}.',
    fr: 'Pas de réponse pour : {domains}.',
    de: 'Keine Antwort für: {domains}.',
    es: 'Sin respuesta para: {domains}.',
  },
  noteInvalid: {
    en: 'Not a domain name: {entries}.',
    fr: 'Pas un nom de domaine : {entries}.',
    de: 'Kein Domainname: {entries}.',
    es: 'No es un nombre de dominio: {entries}.',
  },
  noteDropped: {
    en: 'Ignored (10 domains at most): {dropped}.',
    fr: 'Ignoré (10 domaines au plus) : {dropped}.',
    de: 'Ignoriert (höchstens 10 Domains): {dropped}.',
    es: 'Ignorado (10 dominios como máximo): {dropped}.',
  },

  // configuration actions
  checkEmpty: {
    en: 'Type a domain name first.',
    fr: 'Saisissez d’abord un nom de domaine.',
    de: 'Geben Sie zuerst einen Domainnamen ein.',
    es: 'Escriba primero un nombre de dominio.',
  },
  checkInvalid: {
    en: '"{entry}" is not a domain name.',
    fr: '« {entry} » n’est pas un nom de domaine.',
    de: '„{entry}“ ist kein Domainname.',
    es: '«{entry}» no es un nombre de dominio.',
  },
  checkResult: {
    en: '{summary} Registrar: {registrar}. Source: {source}.',
    fr: '{summary} Registrar : {registrar}. Source : {source}.',
    de: '{summary} Registrar: {registrar}. Quelle: {source}.',
    es: '{summary} Registrador: {registrar}. Fuente: {source}.',
  },
  checkFailed: {
    en: '{domain}: {reason}.',
    fr: '{domain} : {reason}.',
    de: '{domain}: {reason}.',
    es: '{domain}: {reason}.',
  },
  refreshOk: {
    en: '{n} domain(s) checked.',
    fr: '{n} domaine(s) vérifié(s).',
    de: '{n} Domain(s) geprüft.',
    es: '{n} dominio(s) comprobado(s).',
  },
  refreshFailed: {
    en: '{ok} domain(s) checked, no answer for: {domains}.',
    fr: '{ok} domaine(s) vérifié(s), pas de réponse pour : {domains}.',
    de: '{ok} Domain(s) geprüft, keine Antwort für: {domains}.',
    es: '{ok} dominio(s) comprobado(s), sin respuesta para: {domains}.',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab ({n} domain(s)).',
    fr: 'Diagnostic écrit dans l’onglet Journaux ({n} domaine(s)).',
    de: 'Diagnose im Reiter Protokolle ({n} Domain(s)).',
    es: 'Diagnóstico escrito en la pestaña Registros ({n} dominio(s)).',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('summaryIn', 'fr', { domain: 'example.fr', n: 12, date: '29 octobre 2026' });
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('refreshOk', { n: 3 });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

export { LANGUAGES, TEXTS, isLanguage, t, all };
