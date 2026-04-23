import { Faculty } from '../types';
import { fetchOrcidData } from './orcidService';
import { fetchOpenAlexMetrics } from './openAlexService';
import { fetchScopusData } from './scopusService';
import { fetchWosData } from './wosService';
import { mergePublications } from './dataMergeService';

export async function buildFacultyRecord(
  orcid: string,
  position: string,
  dept: string,
  apiKeys: { scopus?: string; wos?: string },
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
  }

  const scopusPubs = await fetchScopusData(orcid, apiKeys.scopus);
  if (scopusPubs.length > 0) {
    facultyData.publications = mergePublications(facultyData.publications, scopusPubs, 'scopus');
  }

  const wosPubs = await fetchWosData(orcid, apiKeys.wos);
  if (wosPubs.length > 0) {
    facultyData.publications = mergePublications(facultyData.publications, wosPubs, 'wos');
  }

  if (institution) facultyData.institution = institution;
  return facultyData;
}
