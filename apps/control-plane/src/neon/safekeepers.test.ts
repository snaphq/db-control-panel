import { describe, expect, it } from 'vitest';
import { safekeeperHostname, safekeeperRegistration } from './safekeepers.js';

describe('safekeepers', () => {
  it('maps id n to pod ordinal n - 1 behind the headless Service', () => {
    expect(safekeeperHostname(1)).toBe(
      'safekeeper-0.safekeeper.neon.svc.cluster.local',
    );
    expect(safekeeperHostname(3)).toBe(
      'safekeeper-2.safekeeper.neon.svc.cluster.local',
    );
  });

  it('rejects ids that cannot exist', () => {
    for (const id of [0, -1, 1.5]) {
      expect(() => safekeeperHostname(id)).toThrowError(/start at 1/);
    }
  });

  it('registers ports 5454 and 7676 in zone az-<id>', () => {
    expect(safekeeperRegistration(2)).toEqual({
      id: 2,
      region_id: 'az-2',
      version: 1,
      host: 'safekeeper-1.safekeeper.neon.svc.cluster.local',
      port: 5454,
      http_port: 7676,
      availability_zone_id: 'az-2',
    });
  });
});
