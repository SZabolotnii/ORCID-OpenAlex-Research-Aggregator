import { Type } from "@sinclair/typebox";
import type { Faculty } from "./types.js";

// ---- Tool Schemas (TypeBox) ----

export const queryFacultyRankingsSchema = Type.Object({
  metric: Type.String({
    description:
      "Metric to rank by: hIndex, citations, pubCount, scopusCount, wosCount, i10Index, citations2Year",
  }),
  department: Type.Optional(
    Type.String({ description: "Filter by department name (optional)" })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results to return (default 10)" })
  ),
  order: Type.Optional(
    Type.String({ description: "Sort order: desc (default) or asc" })
  ),
});

export const searchLocalPublicationsSchema = Type.Object({
  query: Type.Optional(
    Type.String({ description: "Text to search in publication titles" })
  ),
  year: Type.Optional(Type.Number({ description: "Exact publication year" })),
  yearFrom: Type.Optional(
    Type.Number({ description: "Start year of range (inclusive)" })
  ),
  yearTo: Type.Optional(
    Type.Number({ description: "End year of range (inclusive)" })
  ),
  source: Type.Optional(
    Type.String({
      description: "Filter by source: scopus, wos, openalex, orcid",
    })
  ),
  department: Type.Optional(
    Type.String({ description: "Filter by author department" })
  ),
  authorName: Type.Optional(
    Type.String({ description: "Filter by author name (substring match)" })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results (default 20)" })
  ),
});

export const getDepartmentComparisonSchema = Type.Object({
  metrics: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Metrics to compare: memberCount, totalPubs, scopusPubs, wosPubs, avgHIndex, totalCitations, oaPubs. Default: all",
    })
  ),
});

export const getFacultyDetailSchema = Type.Object({
  nameOrOrcid: Type.String({
    description:
      "Faculty name (partial match, case-insensitive) or exact ORCID ID",
  }),
});

export const getAuthorMetricsLiveSchema = Type.Object({
  orcid: Type.String({
    description: "ORCID ID of the researcher (e.g., 0000-0003-0242-2234)",
  }),
});

export const searchGlobalWorksSchema = Type.Object({
  query: Type.String({
    description: "Keywords to search for in OpenAlex (e.g. 'Machine Learning')",
  }),
  year: Type.Optional(
    Type.Number({ description: "Filter by publication year" })
  ),
});

// ---- Tool Execution Logic ----

function getMetricValue(
  f: Faculty,
  metric: string
): number {
  switch (metric) {
    case "hIndex":
      return f.metrics?.hIndex ?? 0;
    case "citations":
      return f.metrics?.citationCount ?? 0;
    case "pubCount":
      return f.publications.length;
    case "scopusCount":
      return f.publications.filter((p) => p.sources.includes("scopus")).length;
    case "wosCount":
      return f.publications.filter((p) => p.sources.includes("wos")).length;
    case "i10Index":
      return f.metrics?.i10Index ?? 0;
    case "citations2Year":
      return f.metrics?.citationCount2Year ?? 0;
    default:
      return 0;
  }
}

export function executeQueryFacultyRankings(
  params: {
    metric: string;
    department?: string;
    limit?: number;
    order?: string;
  },
  facultyList: Faculty[]
) {
  let filtered = facultyList;
  if (params.department) {
    filtered = filtered.filter((f) =>
      f.department.toLowerCase().includes(params.department!.toLowerCase())
    );
  }

  const limit = params.limit ?? 10;
  const order = params.order ?? "desc";

  const ranked = filtered
    .map((f) => ({
      name: f.name,
      department: f.department,
      value: getMetricValue(f, params.metric),
    }))
    .sort((a, b) => (order === "asc" ? a.value - b.value : b.value - a.value))
    .slice(0, limit);

  return {
    metric: params.metric,
    order,
    total: filtered.length,
    results: ranked,
  };
}

export function executeSearchLocalPublications(
  params: {
    query?: string;
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    source?: string;
    department?: string;
    authorName?: string;
    limit?: number;
  },
  facultyList: Faculty[]
) {
  const limit = params.limit ?? 20;
  const results: Array<{
    title: string;
    year: number;
    journal: string | null;
    sources: string[];
    citations?: number;
    doi: string | null;
    facultyName: string;
    department: string;
    isOa?: boolean;
  }> = [];

  let totalMatches = 0;

  for (const f of facultyList) {
    if (
      params.department &&
      !f.department.toLowerCase().includes(params.department.toLowerCase())
    )
      continue;
    if (
      params.authorName &&
      !f.name.toLowerCase().includes(params.authorName.toLowerCase())
    )
      continue;

    for (const p of f.publications) {
      if (params.year && p.year !== params.year) continue;
      if (params.yearFrom && p.year < params.yearFrom) continue;
      if (params.yearTo && p.year > params.yearTo) continue;
      if (params.source && !p.sources.includes(params.source as any)) continue;
      if (
        params.query &&
        !p.title.toLowerCase().includes(params.query.toLowerCase())
      )
        continue;

      totalMatches++;
      if (results.length < limit) {
        results.push({
          title: p.title,
          year: p.year,
          journal: p.journal,
          sources: p.sources,
          citations: p.citationCount,
          doi: p.doi,
          facultyName: f.name,
          department: f.department,
          isOa: p.isOa,
        });
      }
    }
  }

  return { totalMatches, showing: results.length, results };
}

export function executeGetDepartmentComparison(
  params: { metrics?: string[] },
  facultyList: Faculty[]
) {
  const departments = [...new Set(facultyList.map((f) => f.department))];

  const comparison = departments.map((dept) => {
    const members = facultyList.filter((f) => f.department === dept);
    const totalPubs = members.reduce(
      (s, f) => s + f.publications.length,
      0
    );
    const scopusPubs = members.reduce(
      (s, f) =>
        s + f.publications.filter((p) => p.sources.includes("scopus")).length,
      0
    );
    const wosPubs = members.reduce(
      (s, f) =>
        s + f.publications.filter((p) => p.sources.includes("wos")).length,
      0
    );
    const oaPubs = members.reduce(
      (s, f) => s + f.publications.filter((p) => p.isOa).length,
      0
    );
    const membersWithMetrics = members.filter((f) => f.metrics);
    const avgHIndex =
      membersWithMetrics.length > 0
        ? +(
            membersWithMetrics.reduce(
              (s, f) => s + (f.metrics?.hIndex || 0),
              0
            ) / membersWithMetrics.length
          ).toFixed(1)
        : null;
    const totalCitations = members.reduce(
      (s, f) => s + (f.metrics?.citationCount || 0),
      0
    );

    return {
      department: dept,
      memberCount: members.length,
      totalPubs,
      scopusPubs,
      wosPubs,
      oaPubs,
      avgHIndex,
      totalCitations,
    };
  });

  return { departments: comparison };
}

export function executeGetFacultyDetail(
  params: { nameOrOrcid: string },
  facultyList: Faculty[]
) {
  const query = params.nameOrOrcid.toLowerCase();
  const faculty = facultyList.find(
    (f) =>
      f.orcidId === params.nameOrOrcid ||
      f.name.toLowerCase().includes(query)
  );

  if (!faculty) {
    return { error: `Faculty member "${params.nameOrOrcid}" not found` };
  }

  return {
    name: faculty.name,
    orcid: faculty.orcidId,
    position: faculty.position,
    department: faculty.department,
    institution: faculty.institution,
    metrics: faculty.metrics
      ? {
          hIndex: faculty.metrics.hIndex,
          i10Index: faculty.metrics.i10Index,
          citationCount: faculty.metrics.citationCount,
          worksCount: faculty.metrics.worksCount,
          citationCount2Year: faculty.metrics.citationCount2Year,
          topics: faculty.metrics.topics.map((t) => t.name),
          yearlyStats: faculty.metrics.yearlyStats,
        }
      : null,
    publications: faculty.publications.map((p) => ({
      title: p.title,
      year: p.year,
      journal: p.journal,
      type: p.type,
      doi: p.doi,
      sources: p.sources,
      citations: p.citationCount,
      isOa: p.isOa,
    })),
  };
}

export async function executeGetAuthorMetricsLive(params: { orcid: string }) {
  const BASE_URL = "https://api.openalex.org";
  const MAILTO = "admin@researchiq.app";

  try {
    const authorUrl = `${BASE_URL}/authors/https://orcid.org/${params.orcid}?mailto=${MAILTO}`;
    const res = await fetch(authorUrl);
    if (!res.ok) return { error: "Author not found in OpenAlex" };
    const data = await res.json();

    const stats = data.summary_stats || {};
    const currentYear = new Date().getFullYear();
    const citations2Year = (data.counts_by_year || [])
      .filter((y: any) => y.year >= currentYear - 1)
      .reduce((sum: number, y: any) => sum + (y.cited_by_count || 0), 0);

    const topics = (data.x_concepts || [])
      .filter((c: any) => c.level <= 1)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((c: any) => c.display_name);

    const yearlyStats = (data.counts_by_year || [])
      .map((y: any) => ({
        year: y.year,
        citations: y.cited_by_count,
        works: y.works_count,
      }))
      .sort((a: any, b: any) => a.year - b.year)
      .slice(-5);

    // Fetch top works
    const worksUrl = `${BASE_URL}/works?filter=author.orcid:${params.orcid}&sort=cited_by_count:desc&per_page=5&mailto=${MAILTO}`;
    const worksRes = await fetch(worksUrl);
    let topWorks: any[] = [];
    if (worksRes.ok) {
      const worksData = await worksRes.json();
      topWorks = worksData.results.map((w: any) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        journal: w.primary_location?.source?.display_name || "N/A",
        doi: w.doi ? w.doi.replace("https://doi.org/", "") : "",
      }));
    }

    return {
      h_index: stats.h_index || 0,
      i10_index: stats.i10_index || 0,
      works_count: data.works_count || 0,
      citations_total: data.cited_by_count || 0,
      citations_2y: citations2Year,
      top_topics: topics,
      yearly_trend: yearlyStats,
      top_works: topWorks,
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function executeSearchGlobalWorks(params: {
  query: string;
  year?: number;
}) {
  const BASE_URL = "https://api.openalex.org";
  const MAILTO = "admin@researchiq.app";

  try {
    let filter = `default.search:${params.query}`;
    if (params.year) filter += `,publication_year:${params.year}`;

    const url = `${BASE_URL}/works?filter=${filter}&sort=cited_by_count:desc&per_page=5&mailto=${MAILTO}`;
    const res = await fetch(url);
    if (!res.ok) return { error: "Search failed" };
    const data = await res.json();

    return data.results.map((w: any) => ({
      title: w.title,
      year: w.publication_year,
      citations: w.cited_by_count,
      doi: w.doi,
      journal: w.primary_location?.source?.display_name,
    }));
  } catch (e: any) {
    return { error: e.message };
  }
}
