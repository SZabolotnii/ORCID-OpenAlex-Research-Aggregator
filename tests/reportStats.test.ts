/**
 * Tests for server/src/reportStats — the deterministic (LLM-free) report
 * backbone. These guard correctness AND the regression where reports silently
 * truncated to the first 20 faculty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scopeData,
  institutionTotals,
  departmentRows,
  departmentSummaryMd,
  facultyMetricsMd,
  indexedPublicationsMd,
  dataQualityMd,
  facultyCardMd,
  buildDeterministicReport,
  num,
  esc,
} from "../server/src/reportStats";
import type { Faculty, Publication, OpenAlexMetrics } from "../server/src/types";

let pseq = 0;
const pub = (o: Partial<Publication>): Publication => ({
  title: "Some Title",
  year: 2023,
  journal: "Some Journal",
  type: "journal-article",
  doi: "10.1234/x" + pseq,
  url: null,
  putCode: `p${pseq++}`,
  sources: ["orcid"],
  ...o,
});

const metrics = (o: Partial<OpenAlexMetrics>): OpenAlexMetrics => ({
  hIndex: 5,
  i10Index: 3,
  citationCount: 100,
  worksCount: 20,
  citationCount2Year: 10,
  lastUpdated: "2026-01-01",
  topics: [{ name: "AI", score: 1 }],
  yearlyStats: [{ year: 2023, citations: 10, works: 2 }],
  institutions: [],
  topWorks: [{ title: "Top Work", year: 2022, citations: 50, isOa: true, journal: "Nature", doi: "10.1/top" }],
  ...o,
});

let fseq = 0;
const fac = (o: Partial<Faculty> & { name: string }): Faculty => ({
  orcidId: `0000-0000-0000-${String(fseq++).padStart(4, "0")}`,
  name: o.name,
  position: "Доцент",
  department: "Кафедра А",
  country: null,
  biography: null,
  publications: [],
  lastUpdated: "2026-01-01",
  ...o,
});

// --- helpers ----------------------------------------------------------------
test("num and esc format Markdown cells safely", () => {
  assert.equal(num(undefined), "—");
  assert.equal(num(null), "—");
  assert.equal(num(0), "0");
  assert.equal(esc("a|b\nc"), "a\\|b c");
  assert.equal(esc(null), "");
});

// --- scope ------------------------------------------------------------------
test("scopeData filters by department and by faculty id", () => {
  const list = [
    fac({ name: "A", department: "D1" }),
    fac({ name: "B", department: "D2" }),
  ];
  assert.equal(scopeData(list, "All", "All").list.length, 2);
  assert.equal(scopeData(list, "D1", "All").list.length, 1);
  const one = scopeData(list, "All", list[1].orcidId);
  assert.equal(one.list.length, 1);
  assert.equal(one.list[0].name, "B");
});

// --- aggregates -------------------------------------------------------------
test("institutionTotals sums publications, indexed counts, citations and avg h", () => {
  const list = [
    fac({
      name: "A",
      department: "D1",
      metrics: metrics({ hIndex: 10, citationCount: 100 }),
      publications: [pub({ sources: ["scopus", "orcid"] }), pub({ sources: ["orcid"] })],
    }),
    fac({
      name: "B",
      department: "D1",
      metrics: metrics({ hIndex: 20, citationCount: 200 }),
      publications: [pub({ sources: ["wos"] })],
    }),
  ];
  const t = institutionTotals(list);
  assert.equal(t.faculty, 2);
  assert.equal(t.departments, 1);
  assert.equal(t.pubs, 3);
  assert.equal(t.scopus, 1);
  assert.equal(t.wos, 1);
  assert.equal(t.citations, 300);
  assert.equal(t.avgH, "15.0");
});

test("departmentRows produces one row per department", () => {
  const list = [fac({ name: "A", department: "D1" }), fac({ name: "B", department: "D2" })];
  const rows = departmentRows(list);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.dept).sort(), ["D1", "D2"]);
});

test("departmentSummaryMd renders a row containing the department name", () => {
  const md = departmentSummaryMd([fac({ name: "A", department: "Фізика", publications: [pub({})] })]);
  assert.ok(md.includes("Фізика"));
  assert.ok(md.startsWith("| Кафедра |"));
});

// --- faculty / publications -------------------------------------------------
test("facultyMetricsMd lists every member, sorted by h-index desc", () => {
  const list = [
    fac({ name: "Low", metrics: metrics({ hIndex: 2 }) }),
    fac({ name: "High", metrics: metrics({ hIndex: 30 }) }),
  ];
  const md = facultyMetricsMd(list);
  assert.ok(md.includes("Low") && md.includes("High"));
  assert.ok(md.indexOf("High") < md.indexOf("Low"), "higher h-index must come first");
  const dataRows = md.split("\n").length - 2; // minus 2 header lines
  assert.equal(dataRows, 2);
});

test("indexedPublicationsMd includes only Scopus/WoS works, newest first", () => {
  const f = fac({
    name: "A",
    publications: [
      pub({ title: "Indexed 2024", year: 2024, sources: ["scopus"] }),
      pub({ title: "OrcidOnly", year: 2025, sources: ["orcid"] }),
      pub({ title: "Indexed 2020", year: 2020, sources: ["wos"] }),
    ],
  });
  const md = indexedPublicationsMd([f]);
  assert.ok(md.includes("Indexed 2024"));
  assert.ok(md.includes("Indexed 2020"));
  assert.ok(!md.includes("OrcidOnly"), "non-indexed work must be excluded");
  assert.ok(md.indexOf("Indexed 2024") < md.indexOf("Indexed 2020"), "sorted by year desc");
});

test("indexedPublicationsMd handles the empty case", () => {
  const md = indexedPublicationsMd([fac({ name: "A", publications: [pub({ sources: ["orcid"] })] })]);
  assert.ok(md.includes("не знайдено"));
});

test("dataQualityMd reports missing metrics, empty profiles, missing DOIs and review flags", () => {
  const list = [
    fac({ name: "NoMetrics", publications: [pub({ doi: null })] }),
    fac({ name: "Empty", metrics: metrics({}), publications: [] }),
    fac({
      name: "Flagged",
      metrics: metrics({}),
      publications: [pub({ doi: "10.1/ok", provenance: { sources: ["orcid"], reviewFlag: true } } as any)],
    }),
  ];
  const md = dataQualityMd(list);
  assert.ok(/Без метрик OpenAlex: 1/.test(md));
  assert.ok(/Без жодної публікації: 1/.test(md));
  assert.ok(/Публікацій без DOI: 1/.test(md));
  assert.ok(/ревізію.*: 1/.test(md));
});

test("facultyCardMd renders metrics, top works and recent publications", () => {
  const f = fac({
    name: "Іван Петренко",
    metrics: metrics({ hIndex: 7 }),
    publications: [pub({ title: "Recent Paper", year: 2025 })],
  });
  const md = facultyCardMd(f);
  assert.ok(md.includes("Іван Петренко"));
  assert.ok(md.includes(f.orcidId));
  assert.ok(md.includes("h-індекс"));
  assert.ok(md.includes("Top Work")); // from metrics.topWorks
  assert.ok(md.includes("Recent Paper"));
});

// --- the no-truncation regression (old code sliced to 20) -------------------
test("buildDeterministicReport(accreditation) includes ALL faculty, not just 20", () => {
  const list = Array.from({ length: 50 }, (_, i) =>
    fac({
      name: `НПП №${String(i + 1).padStart(2, "0")}`,
      department: `Кафедра ${(i % 4) + 1}`,
      metrics: metrics({ hIndex: i }),
      publications: [pub({ sources: ["scopus"] })],
    })
  );
  const md = buildDeterministicReport(scopeData(list, "All", "All"), "accreditation");
  assert.ok(md.includes("НПП: 50"));
  assert.ok(md.includes("НПП №50"), "the 50th member must appear (no slice(0,20) truncation)");
  assert.ok(md.includes("НПП №01"));
});

test("buildDeterministicReport branches per report type", () => {
  const list = [fac({ name: "A", publications: [pub({ sources: ["scopus"] })] })];
  const scope = scopeData(list, "All", "All");
  assert.ok(buildDeterministicReport(scope, "scopus_wos").includes("бібліографічний список"));
  assert.ok(buildDeterministicReport(scope, "faculty_card").includes("Наукометричні показники"));
  assert.ok(buildDeterministicReport(scope, "general").includes("Ключові показники"));
});
