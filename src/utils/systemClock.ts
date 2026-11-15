export interface SystemClockState {
  hours24: number;
  hours12: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  timeSeconds: number;
  is24Hour: boolean;
  displayHourStr: string;
  minuteStr: string;
  secondStr: string;
  ampm: 'AM' | 'PM' | null;
  formattedHMS: string;
  dateMMDD: string;
  dayOfMonthStr: string;
  weekdayShort: string;
  weekdayLong: string;
  timezone: string;
}

/**
 * Resolves whether the device locale defaults to 24-hour or 12-hour clock formatting.
 */
export function detectSystemIs24Hour(locale?: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
    }).resolvedOptions();
    if (resolved.hourCycle) {
      return resolved.hourCycle === 'h23' || resolved.hourCycle === 'h24';
    }
    if (typeof resolved.hour12 === 'boolean') {
      return !resolved.hour12;
    }
  } catch {
    // Fallback to 12-hour if Intl fails in restricted environment
  }
  return false;
}

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
  } catch {
    return 'Local Time';
  }
}

/**
 * Pure system clock snapshot driven strictly by `new Date()` with automatic
 * 12h/24h locale detection, AM/PM formatting, weekday/date labels, and fractional seconds.
 */
export function getSystemClockState(
  now: Date = new Date(),
  options?: { is24HourOverride?: boolean; timezoneOverride?: string }
): SystemClockState {
  const hours24 = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const timeSeconds =
    hours24 * 3600 + minutes * 60 + seconds + milliseconds / 1000;

  const is24Hour =
    options?.is24HourOverride !== undefined
      ? options.is24HourOverride
      : detectSystemIs24Hour();

  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const displayHour = is24Hour ? hours24 : hours12;
  const ampm: 'AM' | 'PM' | null = is24Hour
    ? null
    : hours24 >= 12
    ? 'PM'
    : 'AM';

  const displayHourStr = String(displayHour).padStart(2, '0');
  const minuteStr = String(minutes).padStart(2, '0');
  const secondStr = String(seconds).padStart(2, '0');

  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateMMDD = `${month}/${day}`;

  const weekdaysShort = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const weekdaysLong = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const dayIdx = now.getDay();

  return {
    hours24,
    hours12,
    minutes,
    seconds,
    milliseconds,
    timeSeconds,
    is24Hour,
    displayHourStr,
    minuteStr,
    secondStr,
    ampm,
    formattedHMS: ampm
      ? `${displayHourStr}:${minuteStr}:${secondStr} ${ampm}`
      : `${displayHourStr}:${minuteStr}:${secondStr}`,
    dateMMDD,
    dayOfMonthStr: day,
    weekdayShort: weekdaysShort[dayIdx] ?? 'SAT',
    weekdayLong: weekdaysLong[dayIdx] ?? 'Saturday',
    timezone: options?.timezoneOverride ?? getDeviceTimeZone(),
  };
}
