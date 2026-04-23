import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  queryFacultyRankingsSchema,
  searchLocalPublicationsSchema,
  getDepartmentComparisonSchema,
  getFacultyDetailSchema,
  getAuthorMetricsLiveSchema,
  searchGlobalWorksSchema,
  getCitationTrendsSchema,
  findCollaborationNetworkSchema,
  executeQueryFacultyRankings,
  executeSearchLocalPublications,
  executeGetDepartmentComparison,
  executeGetFacultyDetail,
  executeGetAuthorMetricsLive,
  executeSearchGlobalWorks,
  executeGetCitationTrends,
  executeFindCollaborationNetwork,
} from "./tools.js";
import type { Faculty } from "./types.js";

// ---- Context Builders ----

function buildFacultyContext(facultyList: Faculty[]): string {
  const currentYear = new Date().getFullYear();

  const compact = facultyList.map((f) => {
    const pubs = f.publications;
    const m = f.metrics;
    const scopus = pubs.filter((p) => p.sources.includes("scopus")).length;
    const wos = pubs.filter((p) => p.sources.includes("wos")).length;
    const oa = pubs.filter((p) => p.isOa).length;

    const yearlyPubs: Record<number, number> = {};
    const yearlyCitations: Record<number, number> = {};
    for (let y = currentYear - 4; y <= currentYear; y++) {
      yearlyPubs[y] = pubs.filter((p) => p.year === y).length;
    }
    if (m?.yearlyStats) {
      for (const ys of m.yearlyStats.filter((s) => s.year >= currentYear - 4)) {
        yearlyCitations[ys.year] = ys.citations;
      }
    }

    const recentPubs = [...pubs]
      .sort((a, b) => b.year - a.year)
      .slice(0, 10)
      .map((p) => ({
        t: p.title.slice(0, 80),
        y: p.year,
        s: p.sources,
        c: p.citationCount,
      }));

    return {
      name: f.name,
      orcid: f.orcidId,
      pos: f.position,
      dept: f.department,
      inst: f.institution,
      pubs: pubs.length,
      scopus,
      wos,
      oa,
      h: m?.hIndex ?? null,
      i10: m?.i10Index ?? null,
      cit: m?.citationCount ?? null,
      cit2y: m?.citationCount2Year ?? null,
      topics: (m?.topics || []).slice(0, 3).map((t) => t.name),
      yPubs: yearlyPubs,
      yCit: yearlyCitations,
      recent: recentPubs,
    };
  });

  return JSON.stringify(compact);
}

function buildAggregateContext(facultyList: Faculty[]): string {
  const departments = [...new Set(facultyList.map((f) => f.department))];

  const deptStats = departments.map((dept) => {
    const members = facultyList.filter((f) => f.department === dept);
    const totalPubs = members.reduce((s, f) => s + f.publications.length, 0);
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
    const membersWithMetrics = members.filter((f) => f.metrics);
    const avgH =
      membersWithMetrics.length > 0
        ? +(
            membersWithMetrics.reduce(
              (s, f) => s + (f.metrics?.hIndex || 0),
              0
            ) / membersWithMetrics.length
          ).toFixed(1)
        : null;
    const totalCit = members.reduce(
      (s, f) => s + (f.metrics?.citationCount || 0),
      0
    );

    return {
      dept,
      members: members.length,
      pubs: totalPubs,
      scopus: scopusPubs,
      wos: wosPubs,
      avgH,
      cit: totalCit,
    };
  });

  return JSON.stringify({
    totalFaculty: facultyList.length,
    totalPubs: facultyList.reduce((s, f) => s + f.publications.length, 0),
    depts: deptStats,
  });
}

// ---- System Prompt ----

export function buildSystemPrompt(
  facultyList: Faculty[],
  lang: "en" | "ua"
): string {
  const langInstruction = lang === "ua" ? "Ukrainian" : "English";
  const institution =
    facultyList.find((f) => f.institution)?.institution || "the university";

  return `You are ResearchIQ, an intelligent research analytics assistant for university administration.
You serve faculty managers, department heads, and administrators at ${institution}.

TODAY'S DATE: ${new Date().toISOString().split("T")[0]}

## YOUR CAPABILITIES
1. INSTANT ANSWERS from local data: You have a complete snapshot of all ${facultyList.length} faculty members below, including metrics, publication counts, and recent works. Use this data FIRST.
2. LOCAL QUERY TOOLS: For complex filtering, rankings, or full publication lists, use: query_faculty_rankings, search_local_publications, get_department_comparison, get_faculty_detail, get_citation_trends.
3. COLLABORATION TOOL: Use find_collaboration_network to discover co-authors for a specific researcher via OpenAlex.
4. EXTERNAL TOOLS: Use get_author_metrics_live ONLY when local data is missing metrics. Use search_global_works ONLY for global literature searches outside our faculty.

## DECISION RULES
- Rankings, comparisons, aggregates → Answer from FACULTY DATA below or use query_faculty_rankings / get_department_comparison
- Publication search/filter → Use search_local_publications
- Full profile of one person → Answer from data below or use get_faculty_detail for complete publication list
- Citation trends over time for one person → Use get_citation_trends
- Collaboration network / co-authors → Use find_collaboration_network (external OpenAlex)
- Global research trends → Use search_global_works (external OpenAlex)
- NEVER call get_author_metrics_live in a loop for multiple faculty. The data is already below.

## RESPONSE RULES
- Respond STRICTLY in ${langInstruction}
- Use Markdown tables for comparisons and rankings
- Be precise with numbers — cite exact values from the data
- When data is missing (null metrics), say so explicitly
- For publication counts, distinguish total vs Scopus vs WoS when relevant
- Provide actionable insights relevant to university administration

## FACULTY DATA SNAPSHOT (${facultyList.length} members)
Key: name, orcid, pos=position, dept=department, inst=institution, pubs=total publications, scopus/wos/oa=indexed counts, h=h-index, i10=i10-index, cit=total citations, cit2y=2-year citations, topics=research areas, yPubs=yearly pub counts, yCit=yearly citations, recent=recent publications (t=title, y=year, s=sources, c=citations)

${buildFacultyContext(facultyList)}

## AGGREGATE STATISTICS
${buildAggregateContext(facultyList)}
`;
}

// ---- Tool Definitions for pi-agent ----

export function createTools(
  facultyList: Faculty[]
): AgentTool<any, any>[] {
  return [
    {
      name: "query_faculty_rankings",
      description:
        "Rank and sort faculty members by any metric (hIndex, citations, pubCount, scopusCount, wosCount, i10Index, citations2Year). Use for questions like 'Who has the highest H-index?' or 'Top 5 by citations'.",
      label: "Faculty Rankings",
      parameters: queryFacultyRankingsSchema,
      async execute(_id, params) {
        const result = executeQueryFacultyRankings(params, facultyList);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "search_local_publications",
      description:
        "Search and filter publications across all loaded faculty. Filter by year, year range, source (scopus/wos), department, author name, or keyword in title. Use for 'Who published in 2025?' or 'Scopus articles in CS dept'.",
      label: "Publication Search",
      parameters: searchLocalPublicationsSchema,
      async execute(_id, params) {
        const result = executeSearchLocalPublications(params, facultyList);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "get_department_comparison",
      description:
        "Compare all departments across multiple metrics: member count, total publications, Scopus/WoS/OA counts, average H-index, total citations. Use for 'Compare departments' or 'Which department is most productive?'.",
      label: "Department Comparison",
      parameters: getDepartmentComparisonSchema,
      async execute(_id, params) {
        const result = executeGetDepartmentComparison(params, facultyList);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "get_faculty_detail",
      description:
        "Get the complete profile of a specific faculty member including ALL publications, metrics, and research topics. Match by name (partial, case-insensitive) or exact ORCID ID.",
      label: "Faculty Detail",
      parameters: getFacultyDetailSchema,
      async execute(_id, params) {
        const result = executeGetFacultyDetail(params, facultyList);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "get_author_metrics_live",
      description:
        "Fetch FRESH metrics from OpenAlex API for a specific researcher by ORCID. Use ONLY when local data snapshot is missing or stale. Do NOT use this in a loop for multiple faculty.",
      label: "Live Metrics",
      parameters: getAuthorMetricsLiveSchema,
      async execute(_id, params) {
        const result = await executeGetAuthorMetricsLive(params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "search_global_works",
      description:
        "Search for scientific papers globally in the OpenAlex database by topic or keyword. Use for analyzing global trends or finding literature OUTSIDE our faculty data.",
      label: "Global Search",
      parameters: searchGlobalWorksSchema,
      async execute(_id, params) {
        const result = await executeSearchGlobalWorks(params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "get_citation_trends",
      description:
        "Get year-by-year publication and citation dynamics for a specific faculty member. Shows how their research output and citations have evolved over recent years. Match by name or ORCID.",
      label: "Citation Trends",
      parameters: getCitationTrendsSchema,
      async execute(_id, params) {
        const result = executeGetCitationTrends(params, facultyList);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "find_collaboration_network",
      description:
        "Discover co-authors and collaboration partners for a researcher by fetching their works from OpenAlex and extracting all co-authors. Use for questions like 'Who does this researcher collaborate with?' or 'What is their collaboration network?'.",
      label: "Collaboration Network",
      parameters: findCollaborationNetworkSchema,
      async execute(_id, params) {
        const result = await executeFindCollaborationNetwork(params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: null,
        };
      },
    },
    {
      name: "get_current_date",
      description: "Get the current date for date-sensitive calculations.",
      label: "Current Date",
      parameters: {},
      async execute() {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                date: new Date().toISOString().split("T")[0],
              }),
            },
          ],
          details: null,
        };
      },
    },
  ];
}
