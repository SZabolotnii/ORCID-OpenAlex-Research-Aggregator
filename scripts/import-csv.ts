#!/usr/bin/env npx tsx
/**
 * Import faculty data from CSV and upload to ResearchIQ site.
 *
 * Usage:
 *   npx tsx scripts/import-csv.ts <csv-file> [options]
 *
 * Options:
 *   --site <url>          Site URL (default: https://orcid-tracker.szabolotnii.site)
 *   --institution <name>  Default institution for all entries
 *   --department <name>   Default department (if not in CSV)
 *   --position <name>     Default position (default: Associate Professor)
 *   --output <file>       Also save JSON to local file
 *   --admin-password <pw> Admin password used to obtain a tenant write token
 *   --auth-token <token>  Existing bearer token for tenant write access
 *   --dry-run             Fetch data but don't upload
 *
 * CSV format (no header required):
 *   Column 1: ORCID ID (required)
 *   Column 2: Department (optional)
 *   Column 3: Position (optional)
 */

import { readFileSync, writeFileSync } from "fs";

// --- Types ---

interface Publication {
  title: string;
  year: number;
  journal: string | null;
  type: string;
  doi: string | null;
  url: string | null;
  putCode: string;
  sources: string[];
  citationCount: number;
  isOa?: boolean;
}

interface Faculty {
  orcidId: string;
  name: string;
  position: string;
  department: string;
  institution?: string;
  country: string | null;
  biography: string | null;
  publications: Publication[];
  metrics?: any;
  lastUpdated: string;
}

// --- CLI Args ---

const args = process.argv.slice(2);
const csvFile = args.find((a) => !a.startsWith("--"));

if (!csvFile) {
  console.error("Usage: npx tsx scripts/import-csv.ts <csv-file> [options]");
  console.error("\nOptions:");
  console.error("  --site <url>          Site URL (default: https://orcid-tracker.szabolotnii.site)");
  console.error("  --tenant <id>         Tenant ID (default: 'default')");
  console.error("  --institution <name>  Default institution");
  console.error("  --department <name>   Default department");
  console.error("  --position <name>     Default position (default: Associate Professor)");
  console.error("  --output <file>       Save JSON locally");
  console.error("  --admin-password <pw> Admin password for tenant write access");
  console.error("  --auth-token <token>  Existing bearer token for tenant write access");
  console.error("  --dry-run             Don't upload, just fetch and save");
  process.exit(1);
}

function getArg(name: string, fallback: string = ""): string {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const SITE_URL = getArg("--site", "https://orcid-tracker.szabolotnii.site");
const TENANT_ID = getArg("--tenant", "default");
const DEFAULT_INSTITUTION = getArg("--institution", "");
const DEFAULT_DEPARTMENT = getArg("--department", "");
const DEFAULT_POSITION = getArg("--position", "Associate Professor");
const OUTPUT_FILE = getArg("--output", "");
const ADMIN_PASSWORD = getArg("--admin-password", "");
const AUTH_TOKEN = getArg("--auth-token", "");
const DRY_RUN = args.includes("--dry-run");

async function getWriteToken(): Promise<string> {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  if (!ADMIN_PASSWORD) {
    throw new Error("Upload requires --admin-password or --auth-token");
  }

  const res = await fetch(`${SITE_URL}/api/tenant/${TENANT_ID}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Verify failed: ${res.status}`);
  }

  const data = await res.json();
  if (data.role !== "admin" || !data.token) {
    throw new Error("Provided credentials do not have admin access");
  }

  return data.token;
}

// --- ORCID Fetcher ---

async function fetchOrcidData(
  orcidId: string,
  position: string,
  department: string
): Promise<Faculty> {
  const BASE = "https://pub.orcid.org/v3.0";
  const headers = { Accept: "application/json" };

  const personRes = await fetch(`${BASE}/${orcidId}/person`, { headers });
  if (!personRes.ok) throw new Error(`ORCID person ${orcidId}: ${personRes.status}`);
  const personData = await personRes.json();

  const name = `${personData.name?.["given-names"]?.value || ""} ${personData.name?.["family-name"]?.value || ""}`.trim();
  const country = personData.addresses?.address?.[0]?.country?.value || null;
  const biography = personData.biography?.content || null;

  const worksRes = await fetch(`${BASE}/${orcidId}/works`, { headers });
  if (!worksRes.ok) throw new Error(`ORCID works ${orcidId}: ${worksRes.status}`);
  const worksData = await worksRes.json();

  const publications: Publication[] = [];
  for (const group of worksData.group || []) {
    const ws = group["work-summary"]?.[0];
    if (!ws) continue;

    const title = ws.title?.title?.value || "Untitled";
    const yearStr = ws["publication-date"]?.year?.value;
    const year = yearStr ? parseInt(yearStr, 10) : 0;
    const type = (ws.type || "unknown").replace(/_/g, " ");

    let doi: string | null = null;
    let url: string | null = ws.url?.value || null;
    const sources: string[] = ["orcid"];

    const ids = ws["external-ids"]?.["external-id"] || [];
    const doiObj = ids.find((id: any) => id["external-id-type"] === "doi");
    if (doiObj) {
      doi = doiObj["external-id-value"];
      if (!url) url = doiObj["external-id-url"]?.value;
    }
    if (ids.find((id: any) => ["eid", "scopus"].includes(id["external-id-type"]))) {
      sources.push("scopus");
    }
    if (ids.find((id: any) => ["wosuid", "wos"].includes(id["external-id-type"]))) {
      sources.push("wos");
    }

    publications.push({
      title,
      year,
      journal: ws["journal-title"]?.value || null,
      type,
      doi,
      url,
      putCode: ws["put-code"],
      sources,
      citationCount: 0,
    });
  }

  publications.sort((a, b) => b.year - a.year);

  return {
    orcidId,
    name: name || "Unknown",
    position,
    department,
    country,
    biography,
    publications,
    lastUpdated: new Date().toISOString(),
  };
}

// --- OpenAlex Fetcher ---

async function fetchOpenAlexMetrics(orcidId: string) {
  const BASE = "https://api.openalex.org";
  const MAILTO = "admin@researchiq.app";

  try {
    const res = await fetch(
      `${BASE}/authors/https://orcid.org/${orcidId}?mailto=${MAILTO}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data.summary_stats || {};

    const currentYear = new Date().getFullYear();
    const citationCount2Year = (data.counts_by_year || [])
      .filter((y: any) => y.year >= currentYear - 1)
      .reduce((sum: number, y: any) => sum + (y.cited_by_count || 0), 0);

    const topics = (data.x_concepts || [])
      .filter((c: any) => c.level <= 1)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((c: any) => ({ name: c.display_name, score: c.score }));

    const yearlyStats = (data.counts_by_year || [])
      .map((y: any) => ({ year: y.year, citations: y.cited_by_count, works: y.works_count }))
      .sort((a: any, b: any) => a.year - b.year);

    const institutions = (data.last_known_institutions || []).map(
      (i: any) => i.display_name
    );

    // Top works
    const worksRes = await fetch(
      `${BASE}/works?filter=author.orcid:${orcidId}&sort=cited_by_count:desc&per_page=25&mailto=${MAILTO}`
    );
    let topWorks: any[] = [];
    if (worksRes.ok) {
      const wd = await worksRes.json();
      topWorks = wd.results.map((w: any) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        isOa: w.open_access?.is_oa || false,
        journal: w.primary_location?.source?.display_name || "N/A",
        doi: w.doi ? w.doi.replace("https://doi.org/", "") : "",
      }));
    }

    return {
      hIndex: stats.h_index || 0,
      i10Index: stats.i10_index || 0,
      citationCount: data.cited_by_count || 0,
      worksCount: data.works_count || 0,
      citationCount2Year,
      lastUpdated: new Date().toISOString(),
      topics,
      yearlyStats,
      institutions,
      topWorks,
    };
  } catch (e) {
    console.error(`  OpenAlex error for ${orcidId}:`, e);
    return null;
  }
}

// --- Enrich publications with OA status ---

function enrichWithOA(faculty: Faculty) {
  if (!faculty.metrics?.topWorks?.length) return;
  const oaByDoi = new Map(
    faculty.metrics.topWorks
      .filter((w: any) => w.doi)
      .map((w: any) => [w.doi.toLowerCase(), w.isOa])
  );
  faculty.publications = faculty.publications.map((pub) => {
    if (pub.doi) {
      const norm = pub.doi.replace("https://doi.org/", "").toLowerCase();
      const isOa = oaByDoi.get(norm);
      if (isOa !== undefined) return { ...pub, isOa };
    }
    return pub;
  });
}

// --- Main ---

async function main() {
  console.log(`\n📄 Reading CSV: ${csvFile}`);
  const csv = readFileSync(csvFile, "utf-8");
  const rows = csv
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  console.log(`   Found ${rows.length} entries\n`);

  const facultyList: Faculty[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(",").map((c) => c.trim());
    const orcid = cols[0];
    const dept = cols[1] || DEFAULT_DEPARTMENT;
    const position = cols[2] || DEFAULT_POSITION;

    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) {
      errors.push(`Row ${i + 1}: invalid ORCID "${orcid}"`);
      continue;
    }

    process.stdout.write(
      `[${i + 1}/${rows.length}] ${orcid} — fetching ORCID... `
    );

    try {
      const faculty = await fetchOrcidData(orcid, position, dept);
      if (DEFAULT_INSTITUTION) faculty.institution = DEFAULT_INSTITUTION;

      process.stdout.write(`${faculty.name} — OpenAlex... `);

      const metrics = await fetchOpenAlexMetrics(orcid);
      if (metrics) {
        faculty.metrics = metrics;
        enrichWithOA(faculty);
      }

      console.log(
        `✓ ${faculty.publications.length} pubs, h=${metrics?.hIndex ?? "N/A"}`
      );

      facultyList.push(faculty);
    } catch (e: any) {
      console.log(`✗ ${e.message}`);
      errors.push(`Row ${i + 1}: ${orcid} — ${e.message}`);
    }

    // Rate limiting
    if (i < rows.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Success: ${facultyList.length}/${rows.length}`);
  if (errors.length) {
    console.log(`Errors:`);
    errors.forEach((e) => console.log(`  ${e}`));
  }

  // Save locally if requested
  if (OUTPUT_FILE) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(facultyList, null, 2));
    console.log(`\nSaved to ${OUTPUT_FILE}`);
  }

  // Upload to site
  if (!DRY_RUN && facultyList.length > 0) {
    console.log(`\nUploading to ${SITE_URL}/api/data/${TENANT_ID} ...`);
    try {
      const writeToken = await getWriteToken();
      const res = await fetch(`${SITE_URL}/api/data/${TENANT_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${writeToken}`,
        },
        body: JSON.stringify(facultyList),
      });
      if (res.ok) {
        const result = await res.json();
        console.log(`✓ Uploaded ${result.count} faculty members`);
      } else {
        const err = await res.text();
        console.error(`✗ Upload failed: ${res.status} ${err}`);
      }
    } catch (e: any) {
      console.error(`✗ Upload error: ${e.message}`);
    }
  } else if (DRY_RUN) {
    console.log(`\n(dry-run — skipped upload)`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
