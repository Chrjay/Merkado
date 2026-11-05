import { describe, expect, it } from 'vitest';
import { makeId } from '../../src/lib/ids';

describe('makeId', () => {
  it('builds S-YYYYMMDD-HHMMSS-XXXX in Manila time with 4 hex chars', () => {
    // 2026-11-02T22:08:12Z -> Manila 2026-11-03 06:08:12
    const id = makeId('S', new Date('2026-11-02T22:08:12.000Z'));
    expect(id).toMatch(/^S-20261103-060812-[0-9A-F]{4}$/);
  });

  it('uses the E prefix for events', () => {
    const id = makeId('E', new Date('2026-11-02T22:08:12.000Z'));
    expect(id).toMatch(/^E-20261103-060812-[0-9A-F]{4}$/);
  });

  it('is Manila-based regardless of the UTC day', () => {
    // 2026-11-02T16:00:00Z -> Manila 2026-11-03 00:00:00
    const id = makeId('S', new Date('2026-11-02T16:00:00.000Z'));
    expect(id.startsWith('S-20261103-000000-')).toBe(true);
  });

  it('produces different suffixes across calls (random hex)', () => {
    const d = new Date('2026-11-02T22:08:12.000Z');
    const ids = new Set(Array.from({ length: 50 }, () => makeId('S', d)));
    // With 16 bits of randomness, 50 draws should almost never fully collide.
    expect(ids.size).toBeGreaterThan(1);
  });

  it('defaults to the current time', () => {
    expect(makeId('S')).toMatch(/^S-\d{8}-\d{6}-[0-9A-F]{4}$/);
  });
});
