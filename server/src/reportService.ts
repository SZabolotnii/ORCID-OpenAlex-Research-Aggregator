import type { Faculty } from "./types.js";
import { generateText } from "./llmProvider.js";

// ---- Standard report generation ----

export async function generateReport(
  facultyList: Faculty[],
  type: string,
  department: string,
  facultyId: string,
  lang: "en" | "ua"
): Promise<string> {
  const langInstruction = lang === "ua" ? "Ukrainian" : "English";

  let dataToAnalyze = facultyList;
  let targetName = "Entire Faculty";

  if (department && department !== "All") {
    dataToAnalyze = dataToAnalyze.filter((f) => f.department === department);
    targetName = `Department of ${department}`;
  }

  if (facultyId && facultyId !== "All") {
    const target = facultyList.find((f) => f.orcidId === facultyId);
    if (target) {
      dataToAnalyze = [target];
      targetName = target.name;
    }
  }

  const reportStructure = (() => {
    switch (type) {
    case "scopus_wos":
      return `
Structure:
1. Summary (total Scopus/WoS publications count, by year)
2. Full Bibliographic List — Markdown table: #, Author(s), Title, Journal, Year, DOI, Database (Scopus/WoS)
   - Include ONLY publications with 'scopus' or 'wos' in sources array
   - Sort by year descending
3. Statistics summary table by department

IMPORTANT: Filter to show only indexed publications (sources contain 'scopus' or 'wos').`;
    case "faculty_card":
      return `
Individual faculty attestation card. Structure:
1. Personal Info (Name, Position, Department, ORCID)
2. Scientometric Indicators — table: H-index, Total Citations, i10-Index, Publications Count, Scopus Count, WoS Count
3. Research Topics / Scientific Interests
4. Top 5 Most Cited Works — table: Title, Journal, Year, Citations, DOI
5. Publication List (last 5 years) — numbered list with full bibliographic details
6. Citation Dynamics — yearly breakdown table

IMPORTANT: If multiple faculty provided, generate a card for each.`;
    case "accreditation":
      return `
Research output report for institutional accreditation. Structure:
1. Executive Summary (institution-level totals)
2. Department Summary Table — columns: Department, Faculty Count, Total Publications, Scopus Pubs, WoS Pubs, Avg H-index, Total Citations
3. Per-Department Details — for each department:
   a. Faculty list with individual metrics (table)
   b. Key research areas
4. Indexed Publications — combined Scopus/WoS list (table)
5. Recommendations for Improvement
6. Data Quality Notes — flag faculty with missing metrics or zero publications

Use formal academic language suitable for ministry/accreditation commission.`;
    default:
      return `
Structure:
1. Executive Summary
2. Key Statistics
3. Research Focus Areas
4. Notable Researchers / Notable Works (include bibliographic details)
5. Recommendations`;
    }
  })();

  const prompt = `Generate a professional academic report in Markdown format.

Report Type: ${type}
Target Entity: ${targetName}
Output Language: ${langInstruction}

Data:
${JSON.stringify(
    dataToAnalyze.slice(0, 20).map((f) => ({
      name: f.name,
      position: f.position,
      dept: f.department,
      metrics: f.metrics
        ? {
            hIndex: f.metrics.hIndex,
            i10Index: f.metrics.i10Index,
            citations: f.metrics.citationCount,
            citations2Year: f.metrics.citationCount2Year,
            topics: f.metrics.topics.map((t) => t.name),
            yearlyStats: f.metrics.yearlyStats,
          }
        : null,
      publications: f.publications.map((p) => ({
        title: p.title,
        year: p.year,
        journal: p.journal,
        type: p.type,
        doi: p.doi,
        sources: p.sources,
        citations: p.citationCount,
      })),
    })),
    null,
    2
  )}

${reportStructure}

  Keep it formal. Use Markdown tables for statistics.`;

  try {
    return await generateText({ prompt, temperature: 0.2 });
  } catch (error: any) {
    console.error("[reportService] generateReport failed:", error?.message || error);
    throw new Error("Report generation failed: " + (error?.message || String(error)), { cause: error });
  }
}

// ---- Template filling ----

export async function fillTemplate(
  facultyList: Faculty[],
  templateContent: string,
  fileType: string,
  lang: "en" | "ua",
  additionalInstructions: string,
  department: string,
  facultyId: string
): Promise<string> {
  const langInstruction = lang === "ua" ? "Ukrainian" : "English";

  let dataToProcess = facultyList;

  if (department && department !== "All") {
    dataToProcess = dataToProcess.filter((f) => f.department === department);
  }

  if (facultyId && facultyId !== "All") {
    const specific = facultyList.find((f) => f.orcidId === facultyId);
    if (specific) dataToProcess = [specific];
  }

  const context = dataToProcess.map((f) => ({
    name: f.name,
    position: f.position,
    department: f.department,
    metrics: f.metrics,
    publications: f.publications.map((p) => ({
      title: p.title,
      year: p.year,
      journal: p.journal,
      type: p.type,
      doi: p.doi,
      citations: p.citationCount,
    })),
  }));

  const prompt = `Task: Fill the provided ${fileType} template with the faculty data below.

Additional Instructions: ${additionalInstructions || "None"}

If the template asks for a list, generate rows for the provided faculty.
If the template asks for specific publications (e.g. "for 2024"), use the 'publications' array to find matches.
If the template is for a specific person, use the single faculty member's data.

Data:
${JSON.stringify(context).slice(0, 60000)}

Template:
${templateContent}

Output ONLY the filled content. Language: ${langInstruction}.
For Excel/CSV inputs, return strictly CSV format.`;

  try {
    return await generateText({ prompt, temperature: 0.1 });
  } catch (error: any) {
    console.error("[reportService] fillTemplate failed:", error?.message || error);
    throw new Error("Template fill failed: " + (error?.message || String(error)), { cause: error });
  }
}
