
import { OpenAlexMetrics, WorkMetric } from '../types';

const BASE_URL = 'https://api.openalex.org';
const MAILTO = 'admin@example.com'; // Politeness pool

export const fetchOpenAlexMetrics = async (orcidId: string): Promise<OpenAlexMetrics | null> => {
  try {
    // 1. Fetch Author Details (Summary, Topics, Trends)
    const authorUrl = `${BASE_URL}/authors/https://orcid.org/${orcidId}?mailto=${MAILTO}`;
    const authorRes = await fetch(authorUrl);
    
    if (authorRes.status === 404) {
      console.warn(`OpenAlex: Author not found for ORCID ${orcidId}`);
      return null;
    }

    if (!authorRes.ok) throw new Error(`Failed to fetch OpenAlex author: ${authorRes.statusText}`);
    const authorData = await authorRes.json();
    const stats = authorData.summary_stats || {};

    // Extract Topics (Concepts) - Top 5 level 0 or 1 concepts
    const topics = (authorData.x_concepts || [])
      .filter((c: any) => c.level <= 1)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((c: any) => ({ name: c.display_name, score: c.score }));

    // Extract Institutions
    const institutions = (authorData.last_known_institutions || [])
      .map((i: any) => i.display_name);

    // Extract Yearly Stats (Trends)
    const yearlyStats = (authorData.counts_by_year || [])
      .map((y: any) => ({ year: y.year, citations: y.cited_by_count, works: y.works_count }))
      .sort((a: any, b: any) => a.year - b.year);

    // 2. Fetch Top Works (for detailed citation counts per paper)
    const worksUrl = `${BASE_URL}/works?filter=author.orcid:${orcidId}&sort=cited_by_count:desc&per_page=5&mailto=${MAILTO}`;
    const worksRes = await fetch(worksUrl);
    let topWorks: WorkMetric[] = [];

    if (worksRes.ok) {
      const worksData = await worksRes.json();
      topWorks = worksData.results.map((w: any) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        isOa: w.open_access?.is_oa || false,
        journal: w.primary_location?.source?.display_name || 'N/A',
        doi: w.doi ? w.doi.replace('https://doi.org/', '') : ''
      }));
    }

    return {
      hIndex: stats.h_index || 0,
      i10Index: stats.i10_index || 0,
      citationCount: stats.cited_by_count || 0,
      worksCount: stats.works_count || 0,
      citationCount2Year: stats['2yr_cited_by_count'] || 0,
      lastUpdated: new Date().toISOString(),
      topics,
      yearlyStats,
      institutions,
      topWorks
    };
  } catch (error) {
    console.error("OpenAlex Fetch Error:", error);
    return null;
  }
};

/**
 * MCP Tool Helper: Search works by keyword/topic to analyze trends.
 * Useful for questions like "What are the latest papers on Machine Learning?"
 */
export const searchWorksByTopic = async (query: string, year?: number) => {
  try {
    let filter = `default.search:${query}`;
    if (year) {
      filter += `,publication_year:${year}`;
    }
    
    const url = `${BASE_URL}/works?filter=${filter}&sort=cited_by_count:desc&per_page=5&mailto=${MAILTO}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    
    return data.results.map((w: any) => ({
      title: w.title,
      year: w.publication_year,
      citations: w.cited_by_count,
      doi: w.doi,
      journal: w.primary_location?.source?.display_name
    }));
  } catch (e) {
    console.error("OpenAlex Search Error", e);
    return [];
  }
};

/**
 * MCP Tool Helper: Get detailed author stats for specific analysis
 */
export const getAuthorStatsRaw = async (orcidId: string) => {
   const data = await fetchOpenAlexMetrics(orcidId);
   if (!data) return { error: "Author not found" };
   // Return a compact version for the LLM to consume tokens efficiently
   return {
     h_index: data.hIndex,
     citations_total: data.citationCount,
     citations_2y: data.citationCount2Year,
     top_topics: data.topics.map(t => t.name),
     yearly_trend: data.yearlyStats.slice(-5) // Last 5 years
   };
};
