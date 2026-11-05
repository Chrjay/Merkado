import { manilaDate, manilaTime } from './time';

/**
 * Phone-made event id, e.g. 'S-20261103-060812-A7F3'.
 * prefix 'S' for sales, 'E' for every other event. Date/time are Manila local.
 * The 4-hex suffix keeps ids unique when two events share the same second.
 */
export function makeId(prefix: 'S' | 'E', now: Date = new Date()): string {
  const date = manilaDate(now).replace(/-/g, '');
  const time = manilaTime(now).replace(/:/g, '');
  const rand = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `${prefix}-${date}-${time}-${rand}`;
}
