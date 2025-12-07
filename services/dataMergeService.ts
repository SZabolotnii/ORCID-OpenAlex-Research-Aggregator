
import { Publication, DataSource } from '../types';

/**
 * Normalizes a DOI string for comparison (lowercase, remove prefixes)
 */
const normalizeDoi = (doi: string | null): string | null => {
  if (!doi) return null;
  return doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, '').trim();
};

/**
 * Normalizes a title for fuzzy comparison
 */
const normalizeTitle = (title: string): string => {
  return title.toLowerCase().replace(/[^\w\s]/g, '').trim();
};

/**
 * Merges a new list of publications into an existing list.
 * Strategy:
 * 1. Match by DOI (Strong match)
 * 2. Match by Title + Year (Weak match)
 * 3. Update metadata: 
 *    - Add new Source
 *    - Update Citation Count (Keep Max)
 *    - Fill missing DOI/Journal
 */
export const mergePublications = (
  existingPubs: Publication[], 
  newPubs: Publication[], 
  sourceName: DataSource
): Publication[] => {
  // Deep copy to avoid mutating state directly
  const merged = [...existingPubs.map(p => ({ ...p, sources: [...p.sources] }))];

  newPubs.forEach(newP => {
    const newDoi = normalizeDoi(newP.doi);
    const newTitleNorm = normalizeTitle(newP.title);

    let matchIndex = -1;

    // 1. Try DOI Match
    if (newDoi) {
      matchIndex = merged.findIndex(p => normalizeDoi(p.doi) === newDoi);
    }

    // 2. Try Title Match if no DOI match found
    if (matchIndex === -1) {
      matchIndex = merged.findIndex(p => 
        normalizeTitle(p.title) === newTitleNorm && 
        Math.abs(p.year - newP.year) <= 1 // Allow 1 year diff
      );
    }

    if (matchIndex > -1) {
      // MERGE EXISTING
      const existing = merged[matchIndex];
      
      // Add source if not present
      if (!existing.sources.includes(sourceName)) {
        existing.sources.push(sourceName);
      }

      // Update Citation Count (Take the max)
      const existingCites = existing.citationCount || 0;
      const newCites = newP.citationCount || 0;
      existing.citationCount = Math.max(existingCites, newCites);

      // Fill missing metadata
      if (!existing.doi && newP.doi) existing.doi = newP.doi;
      if (!existing.journal && newP.journal) existing.journal = newP.journal;
      if (!existing.url && newP.url) existing.url = newP.url;

    } else {
      // ADD NEW
      merged.push({
        ...newP,
        sources: [sourceName],
        citationCount: newP.citationCount || 0
      });
    }
  });

  // Re-sort by year descending
  return merged.sort((a, b) => b.year - a.year);
};
