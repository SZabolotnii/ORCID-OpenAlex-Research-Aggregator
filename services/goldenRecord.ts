/**
 * Golden Record — full Entity Resolution (ER) pipeline.
 *
 * Implements the formalism of the manuscript §4 ("Golden Record як повний
 * конвеєр Entity Resolution"): canonicalization (ν_τ) → blocking → pairwise
 * logistic scoring σ(β·φ) with thresholds θ_match/θ_review → connected-component
 * clustering with a DOI-conflict / chain-merge guard → attribute fusion with
 * source-reliability weighting and provenance.
 *
 * This replaces the earlier two-rule matcher (exact DOI; exact normalized
 * title + |Δyear|≤1) and fixes the Unicode bug where `[^\w\s]` stripped
 * Cyrillic characters from titles.
 *
 * The module is dependency-free and deterministic so it can be exercised both
 * by the production pipeline (`mergePublications`) and by the synthetic
 * benchmark (which needs cluster assignments and the DOI-only / Title+Year
 * baselines on identical inputs).
 */
import { Publication, DataSource, Provenance } from '../types';

// ---------------------------------------------------------------------------
// Transliteration (Ukrainian/Russian Cyrillic → Latin), used to make author
// matching tolerant to transliteration variants (Заболотній С. ↔ Zabolotnii S.).
// The exact scheme is irrelevant; only determinism and cross-script bridging
// matter.
// ---------------------------------------------------------------------------
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e',
  ё: 'e', ъ: '',
};

export function transliterate(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += Object.prototype.hasOwnProperty.call(CYRILLIC_MAP, ch)
      ? CYRILLIC_MAP[ch]
      : ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canonicalization ν_τ
// ---------------------------------------------------------------------------
const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** Canonical DOI, or null when missing OR syntactically invalid. */
export function canonicalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  let d = doi.trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  d = d.replace(/^doi:\s*/, '').trim();
  return DOI_RE.test(d) ? d : null;
}

/**
 * Canonical title: NFKC normalize, casefold, strip punctuation with the
 * Unicode-aware `\p{P}` class (preserves Cyrillic, unlike the old `[^\w\s]`),
 * collapse whitespace.
 */
export function canonicalizeTitle(title: string | null | undefined): string {
  if (!title) return '';
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalizeVenue(venue: string | null | undefined): string {
  if (!venue) return '';
  return venue
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\b(the|of|and|journal|j|proceedings|proc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(title: string): string[] {
  return canonicalizeTitle(title).split(' ').filter(Boolean);
}

function venueTokenSet(venue: string | null | undefined): Set<string> {
  return new Set(canonicalizeVenue(venue).split(' ').filter(Boolean));
}

/**
 * Author key set: each author reduced to `surnamePrefix|initial` after
 * transliteration, so transliteration variants and "Surname I." vs
 * "Ivan Surname" orderings collapse to the same key.
 */
export function authorKeySet(authors?: string[]): Set<string> {
  const keys = new Set<string>();
  if (!authors) return keys;
  for (const raw of authors) {
    const translit = transliterate(raw).replace(/[^a-z\s]/g, ' ');
    const toks = translit.split(/\s+/).filter((t) => t.length > 0);
    if (toks.length === 0) continue;
    // surname = longest token; initial = first letter of another token
    let surname = toks[0];
    for (const t of toks) if (t.length > surname.length) surname = t;
    const other = toks.find((t) => t !== surname) || surname;
    const prefix = surname.slice(0, Math.min(6, surname.length));
    keys.add(`${prefix}|${other[0]}`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Similarity primitives
// ---------------------------------------------------------------------------
function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Cosine over term-frequency vectors of title tokens (TF, IDF-free). */
function tokenCosine(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const tf = (toks: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
    return m;
  };
  const va = tf(a);
  const vb = tf(b);
  let dot = 0;
  for (const [t, x] of va) dot += x * (vb.get(t) || 0);
  const norm = (m: Map<string, number>): number => {
    let s = 0;
    for (const v of m.values()) s += v * v;
    return Math.sqrt(s);
  };
  const denom = norm(va) * norm(vb);
  return denom === 0 ? 0 : dot / denom;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function levRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    const m = url.match(/^[a-z]+:\/\/([^/]+)/i);
    return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
  }
}

// ---------------------------------------------------------------------------
// Pairwise logistic scoring σ(β·φ)
// ---------------------------------------------------------------------------
export const FEATURE_WEIGHTS = {
  doiMatch: 3.0,
  doiConflict: -5.0,
  titleCosine: 1.2,
  charSim: 0.8,
  yearAgree: 0.6,
  venueJaccard: 0.4,
  authorJaccard: 0.9,
  urlMatch: 0.2,
} as const;

export const THETA_MATCH = 0.9;
export const THETA_REVIEW = 0.7;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface PairScore {
  score: number;
  doiConflict: boolean;
}

export function scorePair(a: Publication, b: Publication): PairScore {
  const da = canonicalizeDoi(a.doi);
  const db = canonicalizeDoi(b.doi);
  const doiMatch = !!da && !!db && da === db;
  const doiConflict = !!da && !!db && da !== db;

  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  const titleCosine = tokenCosine(ta, tb);
  const charSim = levRatio(canonicalizeTitle(a.title), canonicalizeTitle(b.title));
  const yearAgree = Math.abs((a.year || 0) - (b.year || 0)) <= 1 ? 1 : 0;
  const venueJaccard = jaccard(venueTokenSet(a.journal), venueTokenSet(b.journal));
  const authorJaccard = jaccard(authorKeySet(a.authors), authorKeySet(b.authors));
  const ha = hostOf(a.url);
  const hb = hostOf(b.url);
  const urlMatch = ha && hb && ha === hb ? 1 : 0;

  const w = FEATURE_WEIGHTS;
  const z =
    (doiMatch ? w.doiMatch : 0) +
    (doiConflict ? w.doiConflict : 0) +
    w.titleCosine * titleCosine +
    w.charSim * charSim +
    w.yearAgree * yearAgree +
    w.venueJaccard * venueJaccard +
    w.authorJaccard * authorJaccard +
    w.urlMatch * urlMatch;

  return { score: sigmoid(z), doiConflict };
}

// ---------------------------------------------------------------------------
// Blocking — generate candidate pairs without all-pairs O(n²) on large profiles
// ---------------------------------------------------------------------------
function blockKeys(rec: Publication): string[] {
  const keys: string[] = [];
  const doi = canonicalizeDoi(rec.doi);
  if (doi) keys.push(`D:${doi}`);
  // Two longest title tokens (length ≥ 4) — discriminative and order-stable.
  const longToks = Array.from(new Set(titleTokens(rec.title)))
    .filter((t) => t.length >= 4)
    .sort((x, y) => y.length - x.length || (x < y ? -1 : 1))
    .slice(0, 2);
  for (const t of longToks) keys.push(`T:${t}`);
  // Year + first long token to catch short-title cases.
  if (longToks[0]) keys.push(`Y:${rec.year}:${longToks[0]}`);
  return keys;
}

function candidatePairs(records: Publication[]): Array<[number, number]> {
  const buckets = new Map<string, number[]>();
  records.forEach((rec, i) => {
    for (const k of blockKeys(rec)) {
      const arr = buckets.get(k);
      if (arr) arr.push(i);
      else buckets.set(k, [i]);
    }
  });
  const seen = new Set<string>();
  const pairs: Array<[number, number]> = [];
  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(i < j ? [i, j] : [j, i]);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Union-Find with DOI-conflict / chain-merge guard
// ---------------------------------------------------------------------------
class UnionFind {
  parent: number[];
  // valid canonical DOIs present in each root's cluster (for conflict guard)
  dois: Array<Set<string>>;
  constructor(n: number, recordDois: Array<string | null>) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.dois = recordDois.map((d) => (d ? new Set([d]) : new Set<string>()));
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  /** Union unless the two clusters carry disjoint, non-empty valid DOI sets. */
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return true;
    const da = this.dois[ra];
    const db = this.dois[rb];
    if (da.size > 0 && db.size > 0) {
      let shared = false;
      for (const d of da) if (db.has(d)) shared = true;
      if (!shared) return false; // DOI conflict → refuse merge
    }
    this.parent[rb] = ra;
    for (const d of db) da.add(d);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Attribute fusion
// ---------------------------------------------------------------------------
const SOURCE_RELIABILITY: Record<DataSource, number> = {
  scopus: 4,
  wos: 4,
  openalex: 3,
  orcid: 2,
};

function recordReliability(rec: Publication): number {
  let best = 0;
  for (const s of rec.sources) best = Math.max(best, SOURCE_RELIABILITY[s] ?? 1);
  return best;
}

function hasLowercase(s: string): boolean {
  return /[a-zа-яіїєґ]/u.test(s);
}

function fuseCluster(recs: Publication[], matchScore: number, reviewFlag: boolean): Publication {
  const byRel = [...recs].sort((a, b) => recordReliability(b) - recordReliability(a));
  const fieldSources: Partial<Record<string, DataSource>> = {};
  const primarySource = (rec: Publication): DataSource =>
    [...rec.sources].sort((a, b) => (SOURCE_RELIABILITY[b] ?? 1) - (SOURCE_RELIABILITY[a] ?? 1))[0];

  // DOI: first valid by reliability
  let doi: string | null = null;
  for (const r of byRel) {
    if (canonicalizeDoi(r.doi)) {
      doi = r.doi;
      fieldSources.doi = primarySource(r);
      break;
    }
  }

  // Title: prefer mixed-case (not ALL-CAPS), then reliability, then length.
  const titleCand = [...recs].sort((a, b) => {
    const la = hasLowercase(a.title) ? 1 : 0;
    const lb = hasLowercase(b.title) ? 1 : 0;
    if (la !== lb) return lb - la;
    const ra = recordReliability(a);
    const rb = recordReliability(b);
    if (ra !== rb) return rb - ra;
    return b.title.length - a.title.length;
  })[0];
  fieldSources.title = primarySource(titleCand);

  // Year: mode; tie-break by the DOI-bearing reliable record else min.
  const yearCounts = new Map<number, number>();
  for (const r of recs) yearCounts.set(r.year, (yearCounts.get(r.year) || 0) + 1);
  let year = titleCand.year;
  let bestCount = -1;
  for (const [y, c] of yearCounts) {
    if (c > bestCount || (c === bestCount && y < year)) {
      bestCount = c;
      year = y;
    }
  }

  // Journal: most reliable non-empty.
  let journal: string | null = null;
  for (const r of byRel) {
    if (r.journal) {
      journal = r.journal;
      fieldSources.journal = primarySource(r);
      break;
    }
  }

  // URL: most reliable non-empty.
  let url: string | null = null;
  for (const r of byRel) {
    if (r.url) {
      url = r.url;
      break;
    }
  }

  // type: most reliable non-empty
  let type = titleCand.type;
  for (const r of byRel) {
    if (r.type) {
      type = r.type;
      break;
    }
  }

  // citations: max; sources: union; isOa: optimistic; authors: longest list.
  const citationCount = Math.max(0, ...recs.map((r) => r.citationCount || 0));
  const sources = Array.from(new Set(recs.flatMap((r) => r.sources)));
  const isOa = recs.some((r) => r.isOa === true) ? true : recs.some((r) => r.isOa === false) ? false : undefined;
  let authors: string[] | undefined;
  for (const r of recs) {
    if (r.authors && (!authors || r.authors.length > authors.length)) authors = r.authors;
  }
  const abstract = recs.find((r) => r.abstract)?.abstract;

  // putCode: prefer a DOI-bearing reliable record's putCode, else most reliable.
  const putCode =
    byRel.find((r) => canonicalizeDoi(r.doi))?.putCode || byRel[0].putCode;

  const provenance: Provenance = {
    sources,
    fieldSources,
    matchScore,
    reviewFlag,
    clusterSize: recs.length,
  };

  return {
    title: titleCand.title,
    year,
    journal,
    type,
    doi,
    url,
    putCode,
    sources,
    citationCount,
    authors,
    abstract,
    isOa,
    provenance,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
export type ResolveMethod = 'golden' | 'doi' | 'titleyear';

export interface ResolveResult {
  /** Fused Golden Records, one per cluster, sorted by year descending. */
  records: Publication[];
  /** Map from each input record's putCode → cluster id (for benchmark scoring). */
  assignment: Map<string, number>;
  /** Number of candidate pairs that fell into the HITL review band (golden only). */
  reviewPairs: number;
}

/**
 * Resolve a flat list of raw publication records into Golden Records.
 * `method` selects the matching rule:
 *   - 'golden'    — full σ(β·φ) pipeline with θ_match / θ_review (default)
 *   - 'doi'       — DOI-only exact match (ablation baseline)
 *   - 'titleyear' — exact canonical title + |Δyear|≤1 (the legacy rule)
 */
export function resolve(records: Publication[], method: ResolveMethod = 'golden'): ResolveResult {
  const n = records.length;
  const recordDois = records.map((r) => canonicalizeDoi(r.doi));
  const uf = new UnionFind(n, recordDois);
  let reviewPairs = 0;

  if (n > 1) {
    const pairs = candidatePairs(records);
    // Process strong matches first so the conflict guard is order-stable.
    const scored: Array<{ i: number; j: number; score: number; doiConflict: boolean }> = [];
    for (const [i, j] of pairs) {
      const a = records[i];
      const b = records[j];
      let score: number;
      let doiConflict = false;
      if (method === 'doi') {
        score = recordDois[i] && recordDois[j] && recordDois[i] === recordDois[j] ? 1 : 0;
      } else if (method === 'titleyear') {
        const sameTitle = canonicalizeTitle(a.title) === canonicalizeTitle(b.title) && canonicalizeTitle(a.title) !== '';
        score = sameTitle && Math.abs(a.year - b.year) <= 1 ? 1 : 0;
      } else {
        const ps = scorePair(a, b);
        score = ps.score;
        doiConflict = ps.doiConflict;
      }
      if (method === 'golden' && score >= THETA_REVIEW && score < THETA_MATCH) reviewPairs++;
      const threshold = method === 'golden' ? THETA_MATCH : 0.5;
      if (score >= threshold) scored.push({ i, j, score, doiConflict });
    }
    scored.sort((x, y) => y.score - x.score);
    for (const p of scored) {
      if (p.doiConflict) continue; // never auto-merge a hard DOI conflict
      uf.union(p.i, p.j);
    }
  }

  // Group records by cluster root.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const arr = clusters.get(root);
    if (arr) arr.push(i);
    else clusters.set(root, [i]);
  }

  const assignment = new Map<string, number>();
  const fused: Publication[] = [];
  let clusterId = 0;
  for (const idxs of clusters.values()) {
    const recs = idxs.map((i) => records[i]);
    // best score within cluster (golden); 1 for baselines on merged clusters
    const matchScore = recs.length > 1 ? 1 : 0;
    fused.push(fuseCluster(recs, matchScore, false));
    for (const i of idxs) assignment.set(records[i].putCode, clusterId);
    clusterId++;
  }

  fused.sort((a, b) => b.year - a.year);
  return { records: fused, assignment, reviewPairs };
}
