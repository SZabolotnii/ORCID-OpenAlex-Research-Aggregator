
import { Faculty, Publication } from '../types';

const BASE_URL = 'https://pub.orcid.org/v3.0';

// Helper to safely extract deep nested values from ORCID XML-to-JSON-like structure
// Note: ORCID API returns complex JSON. We need to navigate it carefully.

export const fetchOrcidData = async (orcidId: string, manualPosition: string, manualDepartment: string): Promise<Faculty> => {
  const headers = { 'Accept': 'application/json' };

  try {
    // 1. Fetch Person Details
    const personRes = await fetch(`${BASE_URL}/${orcidId}/person`, { headers });
    if (!personRes.ok) throw new Error('Failed to fetch person data');
    const personData = await personRes.json();

    const name = `${personData.name['given-names']?.value || ''} ${personData.name['family-name']?.value || ''}`.trim();
    const country = personData.addresses?.address?.[0]?.country?.value || null;
    const biography = personData.biography?.content || null;

    // 2. Fetch Works (Summaries)
    const worksRes = await fetch(`${BASE_URL}/${orcidId}/works`, { headers });
    if (!worksRes.ok) throw new Error('Failed to fetch works data');
    const worksData = await worksRes.json();

    const publications: Publication[] = [];
    const groups = worksData.group || [];

    for (const group of groups) {
      const workSummary = group['work-summary']?.[0];
      if (workSummary) {
        const title = workSummary.title?.title?.value || 'Untitled';
        const yearStr = workSummary['publication-date']?.year?.value;
        const year = yearStr ? parseInt(yearStr, 10) : 0;
        const type = workSummary.type || 'unknown';
        
        let doi = null;
        let url = workSummary.url?.value || null;
        const sources: ('orcid' | 'scopus' | 'wos')[] = ['orcid'];
        
        // Check External IDs for DOI, Scopus (eid), and WoS (wosuid)
        if (workSummary['external-ids']?.['external-id']) {
          const ids = workSummary['external-ids']['external-id'];
          
          const doiObj = ids.find((id: any) => id['external-id-type'] === 'doi');
          if (doiObj) {
            doi = doiObj['external-id-value'];
            if (!url) url = doiObj['external-id-url']?.value;
          }

          // Check for Scopus ID
          const scopusObj = ids.find((id: any) => id['external-id-type'] === 'eid' || id['external-id-type'] === 'scopus');
          if (scopusObj) {
             if (!sources.includes('scopus')) sources.push('scopus');
          }

          // Check for Web of Science ID
          const wosObj = ids.find((id: any) => id['external-id-type'] === 'wosuid' || id['external-id-type'] === 'wos');
          if (wosObj) {
             if (!sources.includes('wos')) sources.push('wos');
          }
        }

        const journal = workSummary['journal-title']?.value || null;

        publications.push({
          title,
          year,
          journal,
          type: type.replace(/_/g, ' '), // Clean up type string
          doi,
          url,
          putCode: workSummary['put-code'],
          sources: sources, 
          citationCount: 0
        });
      }
    }

    // Sort by year desc
    publications.sort((a, b) => b.year - a.year);

    return {
      orcidId,
      name: name || 'Unknown Name',
      position: manualPosition,
      department: manualDepartment,
      country,
      biography,
      publications,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error("ORCID Fetch Error:", error);
    throw error;
  }
};

/**
 * Search ORCID for people by affiliation name.
 * Returns a list of ORCID IDs + Names (fetched in parallel).
 */
export const searchByAffiliation = async (affiliationName: string): Promise<Array<{ orcidId: string, name: string }>> => {
  const headers = { 'Accept': 'application/json' };
  const query = `affiliation-org-name:"${affiliationName}"`;
  
  try {
    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}&rows=20`; // Limit to 20 for performance
    const res = await fetch(searchUrl, { headers });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    
    const results = data.result || [];
    
    // Fetch names in parallel for better UX (Search results don't contain names in v3.0)
    const detailedResults = await Promise.all(
      results.map(async (item: any) => {
        const orcidId = item['orcid-identifier'].path;
        try {
          const name = await fetchBasicPersonDetails(orcidId);
          return { orcidId, name };
        } catch (e) {
          return { orcidId, name: 'Unknown' };
        }
      })
    );

    return detailedResults;
  } catch (error) {
    console.error("ORCID Search Error:", error);
    return [];
  }
};

/**
 * Lightweight fetch just to get a person's name (for search results)
 */
const fetchBasicPersonDetails = async (orcidId: string): Promise<string> => {
   const headers = { 'Accept': 'application/json' };
   const res = await fetch(`${BASE_URL}/${orcidId}/person`, { headers });
   if (!res.ok) return 'Unknown';
   const data = await res.json();
   const name = `${data.name['given-names']?.value || ''} ${data.name['family-name']?.value || ''}`.trim();
   return name || 'Unknown Name';
};
