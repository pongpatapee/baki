import imageMap from '../scripts/exercise-image-map.json';
import { SEED_EXERCISES } from '@/db/seed/exercises';

describe('exercise image map', () => {
  const map = imageMap as Record<string, string | null>;
  const seedIds = new Set(SEED_EXERCISES.map((e) => e.id));

  it('has an entry (photo id or null) for every seeded exercise', () => {
    const missing = [...seedIds].filter((id) => !(id in map));
    expect(missing).toEqual([]);
  });

  it('does not reference exercises that no longer exist', () => {
    const stale = Object.keys(map).filter((id) => !seedIds.has(id));
    expect(stale).toEqual([]);
  });
});
