import { describe, expect, it } from 'vitest';
import { manilaDate, manilaTime } from '../../src/lib/time';

// Asia/Manila is UTC+8 with no DST. These assertions use known UTC instants
// and the independently-computed Manila wall-clock value (UTC + 8h).
describe('manilaDate / manilaTime', () => {
  it('formats a UTC instant as Manila wall-clock date and time', () => {
    // 2026-11-02T22:08:12Z  ->  Manila 2026-11-03 06:08:12
    const d = new Date('2026-11-02T22:08:12.000Z');
    expect(manilaDate(d)).toBe('2026-11-03');
    expect(manilaTime(d)).toBe('06:08:12');
  });

  it('rolls the date forward across the UTC day boundary', () => {
    // 2026-11-02T16:00:00Z -> Manila 2026-11-03 00:00:00
    const d = new Date('2026-11-02T16:00:00.000Z');
    expect(manilaDate(d)).toBe('2026-11-03');
    expect(manilaTime(d)).toBe('00:00:00');
  });

  it('zero-pads single-digit hours, minutes and seconds', () => {
    // 2026-01-04T20:05:09Z -> Manila 2026-01-05 04:05:09
    const d = new Date('2026-01-04T20:05:09.000Z');
    expect(manilaDate(d)).toBe('2026-01-05');
    expect(manilaTime(d)).toBe('04:05:09');
  });

  it('is independent of the machine timezone (TZ env ignored)', () => {
    const d = new Date('2026-11-02T22:08:12.000Z');
    // Regardless of where this runs, Manila is UTC+8.
    expect(manilaDate(d)).toBe('2026-11-03');
    expect(manilaTime(d)).toBe('06:08:12');
  });

  it('defaults to the current time when no argument is passed', () => {
    expect(manilaDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manilaTime()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
