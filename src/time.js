// -----------------------------------------------------------------------------
// Timezone helpers, on top of Intl (full ICU ships with the official Node
// images, Alpine included): no date library needed for what the widget does.
//
// Which timezone: the one of Gladys. The supervisor starts every integration
// container with `TZ=<the timezone set in Gladys>`, so the process timezone
// IS the Gladys one — the moon times, the "compute at midnight" instant and
// the day countdowns all follow the house, not UTC. Every helper still takes
// the timezone explicitly, so the tests run the same on any machine.
// -----------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_TIMEZONE = 'UTC';

const partsFormatters = new Map();

/**
 * @description True for a timezone Intl knows.
 * @param {string} timezone - IANA timezone.
 * @returns {boolean} True when usable.
 * @example
 * isValidTimezone('Europe/Paris');
 */
function isValidTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @description The timezone of Gladys: TZ (set by the supervisor), else the
 * one the process resolved, else UTC.
 * @param {object} [env] - Environment variables.
 * @returns {string} IANA timezone.
 * @example
 * const timezone = resolveTimezone();
 */
function resolveTimezone(env = process.env) {
  if (isValidTimezone(env.TZ)) {
    return env.TZ;
  }
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimezone(resolved) ? resolved : FALLBACK_TIMEZONE;
}

/**
 * @description Wall-clock parts of an instant in a timezone.
 * @param {Date} date - The instant.
 * @param {string} timezone - IANA timezone.
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }} The parts.
 * @example
 * wallClock(new Date(), 'Europe/Paris');
 */
function wallClock(date, timezone) {
  let formatter = partsFormatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timezone, formatter);
  }
  const parts = {};
  formatter.formatToParts(date).forEach(({ type, value }) => {
    if (type !== 'literal') {
      parts[type] = Number(value);
    }
  });
  return parts;
}

/**
 * @description Offset of a timezone from UTC at an instant, in milliseconds.
 * @param {Date} date - The instant.
 * @param {string} timezone - IANA timezone.
 * @returns {number} Local time minus UTC time.
 * @example
 * timezoneOffsetMs(new Date('2026-07-01T00:00:00Z'), 'Europe/Paris'); // 7200000
 */
function timezoneOffsetMs(date, timezone) {
  const { year, month, day, hour, minute, second } = wallClock(date, timezone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * @description The local calendar day of an instant, as YYYY-MM-DD.
 * @param {Date} date - The instant.
 * @param {string} timezone - IANA timezone.
 * @returns {string} The local day.
 * @example
 * localDay(new Date('2026-08-23T23:30:00Z'), 'Europe/Paris'); // '2026-08-24'
 */
function localDay(date, timezone) {
  const { year, month, day } = wallClock(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @description The instant a local wall-clock time happens at, in a timezone.
 * Two passes, so the offset is the one in force at the result (DST days).
 * @param {string} day - The local day, YYYY-MM-DD.
 * @param {number} hour - Local hour, 0-23.
 * @param {string} timezone - IANA timezone.
 * @returns {Date} The instant.
 * @example
 * zonedTime('2026-08-23', 0, 'Europe/Paris'); // 2026-08-22T22:00:00.000Z
 */
function zonedTime(day, hour, timezone) {
  const [year, month, date] = day.split('-').map(Number);
  const asUtc = Date.UTC(year, month - 1, date, hour);
  let instant = asUtc - timezoneOffsetMs(new Date(asUtc), timezone);
  instant = asUtc - timezoneOffsetMs(new Date(instant), timezone);
  return new Date(instant);
}

/**
 * @description Calendar days from the local day of `from` to the local day of
 * `to`, midnight to midnight: an event tomorrow morning is "in 1 day" all day
 * long, never "today" late in the evening (the fix e15d92ba2 of the core PR).
 * @param {Date} to - The event.
 * @param {Date} from - The reference instant.
 * @param {string} timezone - IANA timezone.
 * @returns {number} The number of calendar days (negative in the past).
 * @example
 * calendarDaysBetween(new Date('2026-08-24T06:00:00Z'), new Date('2026-08-23T21:00:00Z'), 'Europe/Paris'); // 1
 */
function calendarDaysBetween(to, from, timezone) {
  const dayNumber = (date) => {
    const { year, month, day } = wallClock(date, timezone);
    return Date.UTC(year, month - 1, day) / MS_PER_DAY;
  };
  return Math.round(dayNumber(to) - dayNumber(from));
}

/**
 * @description Seconds until the next local midnight.
 * @param {Date} now - The current instant.
 * @param {string} timezone - IANA timezone.
 * @returns {number} Seconds, at least 1.
 * @example
 * secondsUntilMidnight(new Date(), 'Europe/Paris');
 */
function secondsUntilMidnight(now, timezone) {
  const today = localDay(now, timezone);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const midnight = zonedTime(tomorrow, 0, timezone);
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * @description Format a time as HH:mm in a timezone, like the core widget.
 * @param {Date|null} date - The instant, null when it does not happen.
 * @param {string} timezone - IANA timezone.
 * @returns {string} HH:mm, or --:-- for no time.
 * @example
 * formatTime(new Date('2026-08-23T16:45:00Z'), 'Europe/Paris'); // '18:45'
 */
function formatTime(date, timezone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '--:--';
  }
  const { hour, minute } = wallClock(date, timezone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * @description Format a date as a short weekday, day and month ("ven. 16 oct.").
 * @param {Date} date - The instant.
 * @param {string} language - BCP 47 language.
 * @param {string} timezone - IANA timezone.
 * @returns {string} The formatted date.
 * @example
 * formatShortDate(new Date('2026-10-16T12:00:00Z'), 'fr', 'Europe/Paris');
 */
function formatShortDate(date, language, timezone) {
  return date.toLocaleDateString(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
}

export {
  MS_PER_DAY,
  isValidTimezone,
  resolveTimezone,
  timezoneOffsetMs,
  localDay,
  zonedTime,
  calendarDaysBetween,
  secondsUntilMidnight,
  formatTime,
  formatShortDate,
};
