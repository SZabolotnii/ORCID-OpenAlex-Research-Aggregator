import type { Publication } from "./types.js";

const SCOPUS_SEARCH_URL = "https://api.elsevier.com/content/search/scopus";
const DEFAULT_REFERER = "https://orcid-csbc.szabolotnii.site/";
// Scopus Search API caps `count` at 25 for the standard/free service level.
const SCOPUS_PAGE_SIZE = 25;
const SCOPUS_MAX_PAGES = 20;

type ScopusEntry = {
  "dc:title"?: string;
  "prism:publicationName"?: string;
  "prism:coverDate"?: string;
  "prism:doi"?: string;
  "subtypeDescription"?: string;
  "dc:identifier"?: string;
  "citedby-count"?: string;
};

type ScopusSearchResponse = {
  "search-results"?: {
    "opensearch:totalResults"?: string;
    entry?: ScopusEntry[] | [{ error?: string }];
  };
  "service-error"?: { status?: { statusText?: string } };
  message?: string;
};

export class ScopusConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopusConfigError";
  }
}

export class ScopusUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ScopusUpstreamError";
    this.status = status;
  }
}

function parseYear(coverDate: string | undefined): number {
  if (!coverDate || coverDate.length < 4) return 0;
  const year = Number.parseInt(coverDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : 0;
}

function parseCitations(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function mapEntryToPublication(entry: ScopusEntry, index: number): Publication | null {
  const title = entry["dc:title"]?.trim();
  if (!title) return null;
  const identifier = entry["dc:identifier"]?.trim() || `scopus-${index}`;
  return {
    title,
    year: parseYear(entry["prism:coverDate"]),
    journal: entry["prism:publicationName"]?.trim() || null,
    type: entry["subtypeDescription"]?.trim() || "journal-article",
    doi: entry["prism:doi"]?.trim() || null,
    url: null,
    putCode: identifier,
    sources: ["scopus"],
    citationCount: parseCitations(entry["citedby-count"]),
  };
}

async function fetchScopusPage(
  apiKey: string,
  referer: string,
  query: string,
  start: number
): Promise<{ entries: ScopusEntry[]; total: number }> {
  const url =
    `${SCOPUS_SEARCH_URL}?query=${encodeURIComponent(query)}` +
    `&count=${SCOPUS_PAGE_SIZE}&start=${start}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-ELS-APIKey": apiKey,
        Accept: "application/json",
        Referer: referer,
      },
    });
  } catch (err: any) {
    throw new ScopusUpstreamError(`Scopus request failed: ${err?.message || err}`, 502);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ScopusUpstreamError(
      `Scopus API ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`,
      response.status
    );
  }

  const body = (await response.json().catch(() => ({}))) as ScopusSearchResponse;
  const results = body["search-results"];
  const rawEntries = results?.entry;
  const total = Number.parseInt(results?.["opensearch:totalResults"] || "0", 10) || 0;

  if (!Array.isArray(rawEntries)) return { entries: [], total };
  // Scopus returns a single-element entry with `error` when no results are found.
  if (rawEntries.length === 1 && (rawEntries[0] as { error?: string }).error) {
    return { entries: [], total };
  }
  return { entries: rawEntries as ScopusEntry[], total };
}

async function fetchAllPagesForQuery(
  apiKey: string,
  referer: string,
  query: string
): Promise<Publication[]> {
  const publications: Publication[] = [];
  let start = 0;
  for (let page = 0; page < SCOPUS_MAX_PAGES; page++) {
    const { entries, total } = await fetchScopusPage(apiKey, referer, query, start);
    if (entries.length === 0) break;

    for (let i = 0; i < entries.length; i++) {
      const pub = mapEntryToPublication(entries[i], publications.length);
      if (pub) publications.push(pub);
    }

    start += entries.length;
    if (start >= total) break;
  }
  return publications;
}

export async function searchScopusForAuthor(
  orcidId: string,
  scopusAuthorId?: string
): Promise<Publication[]> {
  const apiKey = process.env.SCOPUS_API_KEY?.trim();
  if (!apiKey) {
    throw new ScopusConfigError("SCOPUS_API_KEY is not set");
  }
  const referer = process.env.SCOPUS_REFERER?.trim() || DEFAULT_REFERER;

  // Primary path: ORCID(). Falls back to AU-ID() with the Scopus Author ID
  // when the ORCID isn't linked to a Scopus profile (a frequent case).
  const orcidPubs = await fetchAllPagesForQuery(apiKey, referer, `ORCID(${orcidId})`);
  if (orcidPubs.length > 0) return orcidPubs;

  if (scopusAuthorId && /^\d{6,15}$/.test(scopusAuthorId)) {
    return fetchAllPagesForQuery(apiKey, referer, `AU-ID(${scopusAuthorId})`);
  }

  return [];
}
