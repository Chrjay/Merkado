// Manila local date/time, independent of the machine timezone, via Intl.
// Asia/Manila is UTC+8 with no daylight saving.

const TZ = 'Asia/Manila';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** 'YYYY-MM-DD' in Manila local time. */
export function manilaDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return dateFmt.format(now);
}

/** 'HH:MM:SS' in Manila local time. */
export function manilaTime(now: Date = new Date()): string {
  // en-GB with hour12:false formats as HH:MM:SS. Some engines emit '24' for
  // midnight; normalise to '00'.
  const out = timeFmt.format(now);
  return out.startsWith('24:') ? out.replace(/^24:/, '00:') : out;
}
