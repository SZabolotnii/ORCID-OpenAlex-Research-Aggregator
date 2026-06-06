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
/**
 * Golden Records flagged for human review — i.e. fused publications that have an
 * unresolved near-duplicate (a candidate pair in the [θ_review, θ_match) band
 * that the engine did NOT auto-merge). Surface these in the UI so an admin can
 * confirm or split the merge (the HITL contour described in §5.3.4).
 */
export const reviewFlaggedPublications = (pubs: Publication[]): Publication[] =>
  pubs.filter((p) => p.provenance?.reviewFlag === true);

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
