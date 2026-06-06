import type { Faculty } from "./types.js";
import { generateText } from "./llmProvider.js";
import { scopeData, buildDeterministicReport, institutionTotals } from "./reportStats.js";

// ---- Standard report generation ----

export async function generateReport(
  facultyList: Faculty[],
  type: string,
  department: string,
  facultyId: string,
  lang: "en" | "ua"
): Promise<string> {
  const langInstruction = lang === "ua" ? "Ukrainian" : "English";
  const scope = scopeData(facultyList, department, facultyId);

  // 1) Numeric/bibliographic backbone: assembled deterministically from the data
  //    (no LLM) for EVERY faculty member — complete, reproducible, no hallucinated
  //    counts and no silent truncation (the old code sliced to the first 20).
  const deterministic = buildDeterministicReport(scope, type);

  // 2) Narrative: the LLM only writes grounded prose around the authoritative
  //    figures and is told not to alter or invent any numbers/publications.
  const t = institutionTotals(scope.list);
  const narrativePrompt = `You are writing the narrative commentary for an academic research report.
Target: ${scope.targetName}. Output language: ${langInstruction}.

Authoritative pre-computed statistics — DO NOT change, recompute, or contradict these,
and DO NOT invent any publications, people, or figures:
- Faculty members: ${t.faculty}; Departments: ${t.departments}
- Publications: ${t.pubs}; Scopus: ${t.scopus}; WoS: ${t.wos}; Open Access: ${t.oa}
- Average h-index: ${t.avgH}; Total citations: ${t.citations}

Write Markdown with EXACTLY two short sections and nothing else:
"### Підсумок" — 2–4 sentences interpreting the figures above.
"### Рекомендації" — 3–5 concise, actionable bullet points.
Do NOT output any data tables or bibliographic lists; those are generated separately.`;

  let narrative: string;
  try {
    narrative = (await generateText({ prompt: narrativePrompt, temperature: 0.3 })).trim();
  } catch (error: any) {
    // The report must still be produced (with correct, complete figures) even if
    // the LLM provider is unavailable — narrative degrades gracefully.
    console.error(
      "[reportService] narrative generation failed, using deterministic fallback:",
      error?.message || error
    );
    narrative =
      lang === "ua"
        ? `### Підсумок\n\nПроаналізовано ${t.faculty} НПП у ${t.departments} кафедрах: ${t.pubs} публікацій (Scopus ${t.scopus}, WoS ${t.wos}); середній h-індекс ${t.avgH}, сумарних цитувань ${t.citations}.\n\n### Рекомендації\n\n- Доповнити профілі НПП без метрик або без DOI (див. примітки щодо якості даних).`
        : `### Summary\n\n${t.faculty} faculty across ${t.departments} departments: ${t.pubs} publications (Scopus ${t.scopus}, WoS ${t.wos}); average h-index ${t.avgH}, total citations ${t.citations}.\n\n### Recommendations\n\n- Complete profiles for faculty missing metrics or DOIs (see data-quality notes).`;
  }

  return `${deterministic}\n\n## Аналітичний коментар та рекомендації\n\n${narrative}`;
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
