import { describe, expect, it } from 'vitest';
import {
  safekeeperAz,
  safekeeperHostname,
  safekeeperName,
  safekeeperRegistration,
} from './safekeepers.js';

describe('safekeepers', () => {
  it('gives each safekeeper its own Service name, so the address survives restarts', () => {
    expect(safekeeperName(4)).toBe('safekeeper-4');
    expect(safekeeperHostname(1)).toBe('safekeeper-1.neon.svc.cluster.local');
    expect(safekeeperHostname(12)).toBe('safekeeper-12.neon.svc.cluster.local');
  });

  it('puts every safekeeper in its own zone', () => {
    expect(safekeeperAz(3)).toBe('az-3');
    expect(new Set([1, 2, 3, 4].map(safekeeperAz)).size).toBe(4);
  });

  it('rejects ids that cannot exist', () => {
    for (const id of [0, -1, 1.5]) {
      expect(() => safekeeperHostname(id)).toThrowError(/start at 1/);
      expect(() => safekeeperAz(id)).toThrowError(/start at 1/);
    }
  });

  it('registers ports 5454 and 7676 in zone az-<id>', () => {
    expect(safekeeperRegistration(2)).toEqual({
      id: 2,
      region_id: 'az-2',
      version: 1,
      host: 'safekeeper-2.neon.svc.cluster.local',
      port: 5454,
      http_port: 7676,
      availability_zone_id: 'az-2',
    });
  });
});
