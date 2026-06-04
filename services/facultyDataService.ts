import { Faculty, Publication } from '../types';
import { fetchOrcidData } from './orcidService';
import { fetchOpenAlexMetrics } from './openAlexService';
import { fetchScopusData } from './scopusService';
import { fetchWosData } from './wosService';
import { mergePublications } from './dataMergeService';

export async function buildFacultyRecord(
  orcid: string,
  position: string,
  dept: string,
  enrichment: {
    tenantId: string;
    authToken: string | null;
    wosApiKey?: string;
    scopusAuthorId?: string;
  },
  institution?: string
): Promise<Faculty> {
  const facultyData = await fetchOrcidData(orcid, position, dept);

  const metrics = await fetchOpenAlexMetrics(orcid);
  if (metrics) {
    facultyData.metrics = metrics;
    if (metrics.topWorks && metrics.topWorks.length > 0) {
      const oaByDoi = new Map<string, boolean>(
        metrics.topWorks.filter(w => w.doi).map(w => [w.doi.toLowerCase(), w.isOa])
      );
      facultyData.publications = facultyData.publications.map(pub => {
        if (pub.doi) {
          const normalizedDoi = pub.doi.replace('https://doi.org/', '').toLowerCase();
          const isOa = oaByDoi.get(normalizedDoi);
          if (isOa !== undefined) return { ...pub, isOa };
        }
        return pub;
      });
    }

    // Fold OpenAlex works into the publication set through the Golden Record
    // engine, so OpenAlex-only works appear and cross-source duplicates collapse
    // (previously OpenAlex was used for metrics enrichment only).
    if (metrics.topWorks && metrics.topWorks.length > 0) {
      const oaPubs: Publication[] = metrics.topWorks
        .filter((w) => w.title)
        .map((w, i) => ({
          title: w.title,
          year: w.year || 0,
          journal: w.journal && w.journal !== 'N/A' ? w.journal : null,
          type: 'journal-article',
          doi: w.doi || null,
          url: null,
          putCode: `openalex:${w.doi || w.title.slice(0, 40)}-${i}`,
          sources: ['openalex'],
          citationCount: w.citations,
          isOa: w.isOa,
        }));
      facultyData.publications = mergePublications(facultyData.publications, oaPubs, 'openalex');
    }
  }

  const scopusPubs = await fetchScopusData(
    orcid,
    enrichment.tenantId,
    enrichment.authToken,
    enrichment.scopusAuthorId,
  );
  if (scopusPubs.length > 0) {
    facultyData.publications = mergePublications(facultyData.publications, scopusPubs, 'scopus');
  }

  const wosPubs = await fetchWosData(orcid, enrichment.wosApiKey);
  if (wosPubs.length > 0) {
    facultyData.publications = mergePublications(facultyData.publications, wosPubs, 'wos');
  }

  if (institution) facultyData.institution = institution;
  if (enrichment.scopusAuthorId) facultyData.scopusAuthorId = enrichment.scopusAuthorId;
  return facultyData;
}
