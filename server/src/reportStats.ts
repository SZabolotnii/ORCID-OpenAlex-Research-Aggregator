/**
 * Deterministic report assembly — the numeric/bibliographic backbone of every
 * report is computed here in plain TypeScript (no LLM), so the figures are:
 *   - complete (every faculty member is included — no silent truncation),
 *   - reproducible (same input → byte-identical tables),
 *   - free of arithmetic / citation hallucination.
 *
 * The LLM (see reportService) is restricted to narrative prose grounded in these
 * pre-computed statistics. This is the "L2a/L1 for structured data, L2b only for
 * language" split: deterministic tables, generative commentary.
 */
import type { Faculty, Publication } from "./types.js";

// --- formatting helpers ---
const isIndexed = (p: Publication): boolean =>
  p.sources.includes("scopus") || p.sources.includes("wos");

/** Render a possibly-missing number for a Markdown cell. */
export const num = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : String(n);

/** Escape a value for a Markdown table cell (pipes/newlines break tables). */
export const esc = (s: string | null | undefined): string =>
  (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, " ").trim();

export const scopusCount = (f: Faculty): number =>
  f.publications.filter((p) => p.sources.includes("scopus")).length;
export const wosCount = (f: Faculty): number =>
  f.publications.filter((p) => p.sources.includes("wos")).length;

// --- scope selection ---
export interface Scope {
  list: Faculty[];
  targetName: string;
}

export function scopeData(
  facultyList: Faculty[],
  department: string,
  facultyId: string
): Scope {
  let list = facultyList;
  let targetName = "Весь факультет";
  if (department && department !== "All") {
    list = list.filter((f) => f.department === department);
    targetName = `Кафедра: ${department}`;
  }
  if (facultyId && facultyId !== "All") {
    const t = facultyList.find((f) => f.orcidId === facultyId);
    if (t) {
      list = [t];
      targetName = t.name;
    }
  }
  return { list, targetName };
}

// --- aggregates ---
export interface DeptRow {
  dept: string;
  members: number;
  pubs: number;
  scopus: number;
  wos: number;
  oa: number;
  avgH: string;
  cit: number;
}

export function departmentRows(list: Faculty[]): DeptRow[] {
  const depts = [...new Set(list.map((f) => f.department || "—"))].sort();
  return depts.map((dept) => {
    const members = list.filter((f) => (f.department || "—") === dept);
    const withM = members.filter((f) => f.metrics);
    const avgH = withM.length
      ? (withM.reduce((s, f) => s + (f.metrics?.hIndex || 0), 0) / withM.length).toFixed(1)
      : "—";
    return {
      dept,
      members: members.length,
      pubs: members.reduce((s, f) => s + f.publications.length, 0),
      scopus: members.reduce((s, f) => s + scopusCount(f), 0),
      wos: members.reduce((s, f) => s + wosCount(f), 0),
      oa: members.reduce((s, f) => s + f.publications.filter((p) => p.isOa).length, 0),
      avgH,
      cit: members.reduce((s, f) => s + (f.metrics?.citationCount || 0), 0),
    };
  });
}

export interface Totals {
  faculty: number;
  departments: number;
  pubs: number;
  scopus: number;
  wos: number;
  oa: number;
  citations: number;
  avgH: string;
}

export function institutionTotals(list: Faculty[]): Totals {
  const rows = departmentRows(list);
  const withM = list.filter((f) => f.metrics);
  return {
    faculty: list.length,
    departments: new Set(list.map((f) => f.department || "—")).size,
    pubs: list.reduce((s, f) => s + f.publications.length, 0),
    scopus: rows.reduce((s, r) => s + r.scopus, 0),
    wos: rows.reduce((s, r) => s + r.wos, 0),
    oa: rows.reduce((s, r) => s + r.oa, 0),
    citations: list.reduce((s, f) => s + (f.metrics?.citationCount || 0), 0),
    avgH: withM.length
      ? (withM.reduce((s, f) => s + (f.metrics?.hIndex || 0), 0) / withM.length).toFixed(1)
      : "—",
  };
}

// --- Markdown tables ---
export function departmentSummaryMd(list: Faculty[]): string {
  const head =
    "| Кафедра | НПП | Публікації | Scopus | WoS | OA | Сер. h-індекс | Цитувань |\n|---|---|---|---|---|---|---|---|";
  const body = departmentRows(list)
    .map(
      (r) =>
        `| ${esc(r.dept)} | ${r.members} | ${r.pubs} | ${r.scopus} | ${r.wos} | ${r.oa} | ${r.avgH} | ${r.cit} |`
    )
    .join("\n");
  return `${head}\n${body}`;
}

export function facultyMetricsMd(list: Faculty[]): string {
  const head =
    "| НПП | Кафедра | Посада | h | i10 | Цитувань | Публікації | Scopus | WoS |\n|---|---|---|---|---|---|---|---|---|";
  const body = [...list]
    .sort((a, b) => (b.metrics?.hIndex || 0) - (a.metrics?.hIndex || 0))
    .map(
      (f) =>
        `| ${esc(f.name)} | ${esc(f.department)} | ${esc(f.position)} | ${num(
          f.metrics?.hIndex
        )} | ${num(f.metrics?.i10Index)} | ${num(f.metrics?.citationCount)} | ${
          f.publications.length
        } | ${scopusCount(f)} | ${wosCount(f)} |`
    )
    .join("\n");
  return `${head}\n${body}`;
}

export function indexedPublicationsMd(list: Faculty[]): string {
  const rows: Array<{ author: string; p: Publication }> = [];
  for (const f of list)
    for (const p of f.publications) if (isIndexed(p)) rows.push({ author: f.name, p });
  rows.sort((a, b) => b.p.year - a.p.year);
  if (rows.length === 0) return "_Індексованих публікацій не знайдено._";
  const head =
    "| # | Автор(и) | Назва | Журнал | Рік | DOI | База |\n|---|---|---|---|---|---|---|";
  const body = rows
    .map((r, i) => {
      const db = r.p.sources.filter((s) => s === "scopus" || s === "wos").join(", ");
      return `| ${i + 1} | ${esc(r.author)} | ${esc(r.p.title)} | ${esc(
        r.p.journal
      )} | ${r.p.year} | ${esc(r.p.doi)} | ${db} |`;
    })
    .join("\n");
  return `${head}\n${body}`;
}

export function dataQualityMd(list: Faculty[]): string {
  const sample = (names: string[]): string =>
    names.length ? ` (${names.slice(0, 10).join(", ")}${names.length > 10 ? ", …" : ""})` : "";
  const noMetrics = list.filter((f) => !f.metrics).map((f) => f.name);
  const noPubs = list.filter((f) => f.publications.length === 0).map((f) => f.name);
  const noDoi = list.reduce((s, f) => s + f.publications.filter((p) => !p.doi).length, 0);
  // Golden-Record review flag is optional on persisted data, hence the cast.
  const flagged = list.reduce(
    (s, f) =>
      s + f.publications.filter((p) => (p as { provenance?: { reviewFlag?: boolean } }).provenance?.reviewFlag).length,
    0
  );
  return [
    `- Без метрик OpenAlex: ${noMetrics.length}${sample(noMetrics)}`,
    `- Без жодної публікації: ${noPubs.length}${sample(noPubs)}`,
    `- Публікацій без DOI: ${noDoi}`,
    `- Записів, позначених на ручну ревізію (нерозв'язаний дубль): ${flagged}`,
  ].join("\n");
}

export function facultyCardMd(f: Faculty): string {
  const m = f.metrics;
  const metricsTbl = [
    "| Показник | Значення |",
    "|---|---|",
    `| h-індекс | ${num(m?.hIndex)} |`,
    `| Сумарні цитування | ${num(m?.citationCount)} |`,
    `| i10-індекс | ${num(m?.i10Index)} |`,
    `| Публікацій | ${f.publications.length} |`,
    `| Scopus | ${scopusCount(f)} |`,
    `| WoS | ${wosCount(f)} |`,
  ].join("\n");

  const topWorks = (m?.topWorks || []).slice(0, 5);
  const topTbl = topWorks.length
    ? [
        "| # | Назва | Журнал | Рік | Цит. | DOI |",
        "|---|---|---|---|---|---|",
        ...topWorks.map(
          (w, i) =>
            `| ${i + 1} | ${esc(w.title)} | ${esc(w.journal)} | ${w.year} | ${w.citations} | ${esc(
              w.doi
            )} |`
        ),
      ].join("\n")
    : "_Немає даних про найцитованіші праці._";

  const recent = [...f.publications]
    .sort((a, b) => b.year - a.year)
    .slice(0, 20)
    .map(
      (p, i) =>
        `${i + 1}. ${esc(p.title)} // ${esc(p.journal)} — ${p.year}${
          p.doi ? ` — DOI: ${esc(p.doi)}` : ""
        }`
    )
    .join("\n");

  const dyn = (m?.yearlyStats || []).slice(-5);
  const dynTbl = dyn.length
    ? [
        "| Рік | Праць | Цитувань |",
        "|---|---|---|",
        ...dyn.map((s) => `| ${s.year} | ${s.works} | ${s.citations} |`),
      ].join("\n")
    : "";

  const topics = (m?.topics || []).slice(0, 5).map((t) => t.name).join(", ");

  return [
    `## ${esc(f.name)}`,
    `**Посада:** ${esc(f.position)} · **Кафедра:** ${esc(f.department)} · **ORCID:** ${esc(
      f.orcidId
    )}`,
    `### Наукометричні показники\n\n${metricsTbl}`,
    topics ? `### Наукові інтереси\n\n${topics}` : "",
    `### Найцитованіші праці\n\n${topTbl}`,
    dynTbl ? `### Динаміка цитувань\n\n${dynTbl}` : "",
    `### Публікації (останні до 20)\n\n${recent || "_Немає публікацій._"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Assemble the full deterministic (LLM-free) body of a report for a given type.
 * Every faculty member in `scope.list` is included — there is no truncation.
 */
export function buildDeterministicReport(scope: Scope, type: string): string {
  const { list, targetName } = scope;
  const t = institutionTotals(list);
  const today = new Date().toISOString().split("T")[0];
  const header = `# Звіт: ${esc(targetName)}\n\n_Сформовано: ${today} · НПП: ${t.faculty} · Кафедр: ${t.departments}_`;

  switch (type) {
    case "scopus_wos":
      return [
        header,
        `## Зведення\n\nІндексованих публікацій (Scopus/WoS): **${
          t.scopus + t.wos
        }** (Scopus: ${t.scopus}, WoS: ${t.wos}). Усього публікацій: ${t.pubs}.`,
        `## Повний бібліографічний список (Scopus/WoS)\n\n${indexedPublicationsMd(list)}`,
        `## Статистика за кафедрами\n\n${departmentSummaryMd(list)}`,
      ].join("\n\n");
    case "faculty_card":
      return [header, ...list.map((f) => facultyCardMd(f))].join("\n\n");
    case "accreditation":
      return [
        header,
        `## Підсумкові показники\n\n- НПП: ${t.faculty}\n- Публікацій: ${t.pubs}\n- Scopus: ${t.scopus} · WoS: ${t.wos} · Open Access: ${t.oa}\n- Середній h-індекс: ${t.avgH}\n- Сумарних цитувань: ${t.citations}`,
        `## Зведення за кафедрами\n\n${departmentSummaryMd(list)}`,
        `## Показники НПП\n\n${facultyMetricsMd(list)}`,
        `## Індексовані публікації\n\n${indexedPublicationsMd(list)}`,
        `## Примітки щодо якості даних\n\n${dataQualityMd(list)}`,
      ].join("\n\n");
    default:
      return [
        header,
        `## Ключові показники\n\n- НПП: ${t.faculty}\n- Публікацій: ${t.pubs}\n- Scopus: ${t.scopus} · WoS: ${t.wos} · OA: ${t.oa}\n- Середній h-індекс: ${t.avgH} · Сумарних цитувань: ${t.citations}`,
        `## Зведення за кафедрами\n\n${departmentSummaryMd(list)}`,
      ].join("\n\n");
  }
}
