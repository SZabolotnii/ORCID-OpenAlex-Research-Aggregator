import { Publication, DataSource } from '../types';
import { resolve } from './goldenRecord';

export {
  canonicalizeDoi,
  canonicalizeTitle,
  canonicalizeVenue,
  scorePair,
  resolve,
  transliterate,
  FEATURE_WEIGHTS,
  THETA_MATCH,
  THETA_REVIEW,
} from './goldenRecord';
export type { ResolveMethod, ResolveResult } from './goldenRecord';

/**
 * Merge a new list of publications into an existing list using the full
 * Golden Record Entity-Resolution pipeline (see `goldenRecord.ts`).
 *
 * Signature preserved for backward compatibility with `facultyDataService`
 * and `scripts/import-csv.ts`. The new records are tagged with `sourceName`,
 * concatenated with the existing (already-fused) records, and the whole set is
 * re-resolved — so cross-source duplicates collapse into a single Golden
 * Record with provenance, regardless of which source introduced them.
 */
export const mergePublications = (
  existingPubs: Publication[],
  newPubs: Publication[],
  sourceName: DataSource
): Publication[] => {
  const tagged = newPubs.map((p) => ({
    ...p,
    sources:
      p.sources && p.sources.length > 0
        ? Array.from(new Set<DataSource>([...p.sources, sourceName]))
        : [sourceName],
  }));
  const existing = existingPubs.map((p) => ({ ...p, sources: [...p.sources] }));
  return resolve([...existing, ...tagged], 'golden').records;
};
