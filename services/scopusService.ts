import { Publication } from '../types';

// Scopus is fetched server-side via /api/enrichment/scopus.
// The Elsevier API key is domain-locked and lives in server/.env (SCOPUS_API_KEY).
// Failures (no key configured, upstream error, missing token) are treated as
// "no Scopus data" so the rest of the faculty enrichment pipeline still completes.

export const fetchScopusData = async (
  orcidId: string,
  tenantId: string,
  authToken: string | null,
  scopusAuthorId?: string,
): Promise<Publication[]> => {
  if (!authToken) return [];

  try {
    const response = await fetch('/api/enrichment/scopus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ tenantId, orcidId, scopusAuthorId }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.warn(
        `Scopus enrichment skipped (${response.status}):`,
        body.error || response.statusText,
      );
      return [];
    }

    const body = (await response.json()) as { publications?: Publication[] };
    return Array.isArray(body.publications) ? body.publications : [];
  } catch (e) {
    console.error('Scopus proxy request failed:', e);
    return [];
  }
};
