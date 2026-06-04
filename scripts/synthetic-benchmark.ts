#!/usr/bin/env npx tsx
/**
 * Synthetic benchmark for the ResearchIQ Golden Record Entity-Resolution engine.
 *
 * Generates a *synthetic, generalized model* mid-size Ukrainian university
 * (no real institution / no personal data), projects each canonical work into
 * ORCID / OpenAlex / Scopus records with controlled, gold-labelled duplication
 * and metadata corruption, then runs the REAL engine (`services/goldenRecord`)
 * plus DOI-only and Title+Year baselines on identical inputs.
 *
 * Outputs reproducible metrics with Monte-Carlo variance (mean ± 95% CI):
 *   - pairwise Precision / Recall / F1, B-cubed F1   (dedup quality vs gold)
 *   - merged-record field completeness / accuracy
 *   - dedup compute time vs a transparent manual-effort model
 *   - sensitivity sweeps over duplication rate and corruption level
 *
 * Artifacts → paper/benchmark/.  Run:  npm run benchmark   (or: npx tsx scripts/synthetic-benchmark.ts)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve as resolveER, canonicalizeTitle, canonicalizeDoi } from '../services/goldenRecord';
import type { ResolveMethod } from '../services/goldenRecord';
import { Publication, DataSource } from '../types';

// ===========================================================================
// Seeded RNG (deterministic, reproducible)
// ===========================================================================
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const choice = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const bern = (rng: Rng, p: number) => rng() < p;
function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function logNormalInt(rng: Rng, muLog: number, sigmaLog: number, lo: number, hi: number): number {
  const x = Math.round(Math.exp(muLog + sigmaLog * gaussian(rng)));
  return Math.max(lo, Math.min(hi, x));
}

// ===========================================================================
// Vocabulary for synthetic titles / venues / names
// ===========================================================================
type Discipline = 'stem' | 'sochum' | 'medlife';

const UA_TOKENS: Record<Discipline, string[]> = {
  stem: ['алгоритм', 'оптимізація', 'мережа', 'сигнал', 'модель', 'система', 'метод', 'аналіз', 'дані', 'нейронний', 'кластеризація', 'фільтр', 'квантовий', 'обчислення', 'структура', 'градієнт', 'спектральний', 'розподілений', 'адаптивний', 'стохастичний', 'регуляризація', 'апроксимація', 'паралельний', 'детермінований', 'ентропія', 'топологія', 'інваріант', 'збіжність', 'багатовимірний', 'розрідженість', 'ядро', 'тензор', 'граф', 'марковський', 'байєсівський', 'варіаційний', 'дискретний', 'нелінійний', 'асимптотичний', 'робастний'],
  sochum: ['освіта', 'компетентність', 'цифровий', 'управління', 'політика', 'комунікація', 'студент', 'навчання', 'оцінювання', 'трансформація', 'інновація', 'дискурс', 'ідентичність', 'культура', 'мотивація', 'інклюзія', 'гейміфікація', 'рефлексія', 'автономія', 'наратив', 'медіаграмотність', 'дистанційний', 'змішаний', 'куратор', 'мобільність', 'академічний', 'доброчесність', 'самооцінка', 'колаборація', 'фасилітація', 'тьюторство', 'неформальний', 'компетенція', 'продуктивність', 'залученість', 'персоналізація', 'критичний', 'громадянський', 'емоційний', 'когнітивний'],
  medlife: ['клітина', 'білок', 'терапія', 'діагностика', 'пацієнт', 'геном', 'фермент', 'тканина', 'патологія', 'імунний', 'рецептор', 'клінічний', 'біомаркер', 'синдром', 'метаболізм', 'апоптоз', 'запалення', 'мутація', 'експресія', 'мікробіом', 'нейрон', 'судинний', 'онкологічний', 'регенерація', 'гомеостаз', 'оксидативний', 'мітохондрія', 'цитокін', 'антитіло', 'фенотип', 'епігенетика', 'фармакологія', 'токсичність', 'резистентність', 'диференціація', 'проліферація', 'сигналінг', 'гіпоксія', 'фіброз', 'плазма'],
};
const EN_TOKENS: Record<Discipline, string[]> = {
  stem: ['algorithm', 'optimization', 'network', 'signal', 'model', 'system', 'method', 'analysis', 'data', 'neural', 'clustering', 'filter', 'quantum', 'computation', 'structure', 'gradient', 'spectral', 'distributed', 'adaptive', 'stochastic', 'regularization', 'approximation', 'parallel', 'deterministic', 'entropy', 'topology', 'invariant', 'convergence', 'multidimensional', 'sparsity', 'kernel', 'tensor', 'graph', 'markov', 'bayesian', 'variational', 'discrete', 'nonlinear', 'asymptotic', 'robust'],
  sochum: ['education', 'competence', 'digital', 'management', 'policy', 'communication', 'student', 'learning', 'assessment', 'transformation', 'innovation', 'discourse', 'identity', 'culture', 'motivation', 'inclusion', 'gamification', 'reflection', 'autonomy', 'narrative', 'literacy', 'distance', 'blended', 'curator', 'mobility', 'academic', 'integrity', 'self-esteem', 'collaboration', 'facilitation', 'tutoring', 'informal', 'competency', 'productivity', 'engagement', 'personalization', 'critical', 'civic', 'emotional', 'cognitive'],
  medlife: ['cell', 'protein', 'therapy', 'diagnostics', 'patient', 'genome', 'enzyme', 'tissue', 'pathology', 'immune', 'receptor', 'clinical', 'biomarker', 'syndrome', 'metabolism', 'apoptosis', 'inflammation', 'mutation', 'expression', 'microbiome', 'neuron', 'vascular', 'oncologic', 'regeneration', 'homeostasis', 'oxidative', 'mitochondria', 'cytokine', 'antibody', 'phenotype', 'epigenetics', 'pharmacology', 'toxicity', 'resistance', 'differentiation', 'proliferation', 'signaling', 'hypoxia', 'fibrosis', 'plasma'],
};
const VENUES: Record<Discipline, string[]> = {
  stem: ['Journal of Computational Methods', 'IEEE Transactions on Signal Processing', 'Кібернетика та системний аналіз', 'Applied Mathematics and Computation'],
  sochum: ['Information Technologies and Learning Tools', 'Educational Technology Research', 'Вища освіта України', 'Computers & Education'],
  medlife: ['Ukrainian Biochemical Journal', 'Journal of Clinical Medicine', 'Молекулярна біологія', 'Cell Reports'],
};
const UA_SURNAMES = ['Заболотній', 'Коваленко', 'Шевченко', 'Бондаренко', 'Ткаченко', 'Мельник', 'Кравченко', 'Поліщук', 'Савченко', 'Руденко', 'Марченко', 'Лисенко', 'Гриценко', 'Павленко', 'Іваненко'];
const UA_INITIALS = ['С', 'О', 'В', 'М', 'І', 'А', 'Н', 'П', 'Т', 'Д', 'К', 'Л'];

// ===========================================================================
// University / corruption configuration
// ===========================================================================
interface GenConfig {
  researchers: number;
  departments: number;
  dupRate: number; // fraction of records that are duplicates (paper claims 0.15–0.25)
  corruption: number; // global multiplier on all corruption probabilities
}
const BASE_CONFIG: GenConfig = {
  researchers: 150,
  departments: 20,
  dupRate: 0.2,
  corruption: 1.0,
};
const DISCIPLINE_MIX: Array<[Discipline, number]> = [
  ['stem', 0.4],
  ['sochum', 0.35],
  ['medlife', 0.25],
];
const DOI_PROB: Record<Discipline, number> = { stem: 0.85, sochum: 0.45, medlife: 0.75 };
const CROSSLANG_PROB: Record<Discipline, number> = { stem: 0.25, sochum: 0.5, medlife: 0.4 };

let GLOBAL_ENTITY = 0;
let GLOBAL_RECORD = 0;

interface CanonWork {
  entityId: number;
  discipline: Discipline;
  year: number;
  uaTitle: string;
  enTitle: string;
  crossLang: boolean;
  doi: string | null;
  journal: string;
  authors: string[];
  citations: number;
}

function makeTitle(rng: Rng, tokens: string[]): string {
  // Sample WITHOUT replacement so distinct works get distinguishable titles
  // (real paper titles are highly distinctive; sampling with replacement from a
  // small pool would make genuinely-different works collide and deflate precision).
  const k = randInt(rng, 6, 10);
  const pool = [...tokens];
  const words: string[] = [];
  for (let i = 0; i < k && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    words.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return words.join(' ');
}

function makeAuthors(rng: Rng): string[] {
  const k = randInt(rng, 1, 5);
  const authors: string[] = [];
  for (let i = 0; i < k; i++) {
    authors.push(`${choice(rng, UA_SURNAMES)} ${choice(rng, UA_INITIALS)}.${choice(rng, UA_INITIALS)}.`);
  }
  return authors;
}

function genCanonWork(rng: Rng, disc: Discipline): CanonWork {
  const crossLang = bern(rng, CROSSLANG_PROB[disc]);
  const year = randInt(rng, 2020, 2024);
  const doi = bern(rng, DOI_PROB[disc])
    ? `10.${randInt(rng, 1000, 9999)}/${disc}.${randInt(rng, 10000, 99999)}`
    : null;
  return {
    entityId: GLOBAL_ENTITY++,
    discipline: disc,
    year,
    uaTitle: makeTitle(rng, UA_TOKENS[disc]),
    enTitle: makeTitle(rng, EN_TOKENS[disc]),
    crossLang,
    doi,
    journal: choice(rng, VENUES[disc]),
    authors: makeAuthors(rng),
    citations: Math.max(0, Math.round(Math.exp(2 + 1.2 * gaussian(rng)))),
  };
}

// --- corruption helpers ---
function corruptTitle(rng: Rng, title: string, c: number): string {
  let t = title;
  if (bern(rng, 0.6 * c)) t = t.toUpperCase(); // ALL-CAPS (e.g. Scopus)
  if (bern(rng, 0.5 * c)) t = t.replace(/\s/g, bern(rng, 0.5) ? '  ' : ' ') + (bern(rng, 0.5) ? '.' : '');
  if (bern(rng, 0.3 * c)) t = `«${t}»`; // smart quotes / punctuation
  return t;
}
function corruptDoi(rng: Rng, doi: string | null, c: number): string | null {
  if (!doi) return null;
  if (bern(rng, 0.1 * c)) return `doi: ${doi} `; // malformed but recoverable-ish
  if (bern(rng, 0.05 * c)) return doi.replace('10.', '11.'); // invalid prefix
  return doi;
}
function corruptAuthors(rng: Rng, authors: string[], c: number): string[] {
  if (!bern(rng, 0.6 * c)) return authors;
  // transliterate + reorder to simulate cross-source author variants
  const TR: Record<string, string> = {
    Заболотній: 'Zabolotnii', Коваленко: 'Kovalenko', Шевченко: 'Shevchenko', Бондаренко: 'Bondarenko',
    Ткаченко: 'Tkachenko', Мельник: 'Melnyk', Кравченко: 'Kravchenko', Поліщук: 'Polishchuk',
    Савченко: 'Savchenko', Руденко: 'Rudenko', Марченко: 'Marchenko', Лисенко: 'Lysenko',
    Гриценко: 'Hrytsenko', Павленко: 'Pavlenko', Іваненко: 'Ivanenko',
  };
  return authors.map((a) => {
    const parts = a.split(' ');
    const sur = parts[0];
    const tr = TR[sur] || sur;
    // sometimes "Initial Surname" order, sometimes drop second initial
    return bern(rng, 0.5) ? `${parts[1] || ''} ${tr}`.trim() : tr;
  });
}
function abbreviateVenue(rng: Rng, venue: string, c: number): string {
  if (!bern(rng, 0.5 * c)) return venue;
  return venue
    .split(' ')
    .map((w) => (w.length > 4 ? w.slice(0, 4) + '.' : w))
    .join(' ');
}

/** Project a canonical work into a record from a given source, with corruption. */
function project(rng: Rng, w: CanonWork, source: DataSource, c: number): Publication {
  // base title: cross-language works may surface translated/transliterated titles
  let title: string;
  if (w.crossLang && (source === 'scopus' || source === 'openalex') && bern(rng, 0.4 * c)) {
    title = w.enTitle; // translation variant → breaks exact/token matching (realistic cliff)
  } else if (w.crossLang && source === 'orcid' && bern(rng, 0.3 * c)) {
    title = w.uaTitle;
  } else {
    title = source === 'orcid' ? w.uaTitle : bern(rng, 0.5) ? w.enTitle : w.uaTitle;
  }
  title = corruptTitle(rng, title, c);

  let doi = w.doi;
  if (source === 'orcid' && bern(rng, 0.35 * c)) doi = null; // ORCID cold-profile DOI drop
  doi = corruptDoi(rng, doi, c);

  let year = w.year;
  if (bern(rng, 0.15 * c)) year += bern(rng, 0.5) ? 1 : -1; // preprint vs published
  else if (bern(rng, 0.05 * c)) year += bern(rng, 0.5) ? 2 : -2;

  const journal = abbreviateVenue(rng, w.journal, c);
  const authors = corruptAuthors(rng, w.authors, c);

  return {
    title,
    year,
    journal,
    type: 'journal-article',
    doi,
    url: bern(rng, 0.4) ? `https://${source}.example.org/${randInt(rng, 1, 99999)}` : null,
    putCode: `g${GLOBAL_RECORD++}`,
    sources: [source],
    citationCount: Math.max(0, w.citations + randInt(rng, -2, 2)),
    authors,
  };
}

interface ResearcherData {
  records: Publication[];
  gold: Map<string, number>; // putCode -> entityId
  canon: Map<number, CanonWork>;
  dupDecisions: number;
}

function genResearcher(rng: Rng, cfg: GenConfig): ResearcherData {
  const disc = (() => {
    const r = rng();
    let acc = 0;
    for (const [d, p] of DISCIPLINE_MIX) {
      acc += p;
      if (r <= acc) return d;
    }
    return 'stem' as Discipline;
  })();
  const nWorks = logNormalInt(rng, Math.log(12), 0.9, 1, 300);
  const works: CanonWork[] = [];
  for (let i = 0; i < nWorks; i++) works.push(genCanonWork(rng, disc));

  // Hard negatives: a few near-identical distinct works (title collision, diff DOI)
  const nHard = bern(rng, 0.3) ? randInt(rng, 1, 2) : 0;
  for (let i = 0; i < nHard && works.length > 0; i++) {
    const base = choice(rng, works);
    const twin = genCanonWork(rng, disc);
    twin.uaTitle = base.uaTitle; // identical title
    twin.enTitle = base.enTitle;
    twin.year = base.year;
    twin.crossLang = base.crossLang;
    // distinct DOI guaranteed (genCanonWork gave it its own / null)
    works.push(twin);
  }

  const records: Publication[] = [];
  const gold = new Map<string, number>();
  const canon = new Map<number, CanonWork>();

  // base ORCID record for every work
  for (const w of works) {
    canon.set(w.entityId, w);
    const rec = project(rng, w, 'orcid', cfg.corruption);
    records.push(rec);
    gold.set(rec.putCode, w.entityId);
  }

  // inject duplicates from secondary sources to hit the target dup fraction
  const baseCount = records.length;
  const targetDup = Math.round((cfg.dupRate / (1 - cfg.dupRate)) * baseCount);
  const secondary: DataSource[] = ['openalex', 'scopus'];
  let added = 0;
  let guard = 0;
  const usedSources = new Map<number, Set<DataSource>>();
  while (added < targetDup && guard < targetDup * 20 + 50) {
    guard++;
    const w = choice(rng, works);
    const used = usedSources.get(w.entityId) || new Set<DataSource>();
    const avail = secondary.filter((s) => !used.has(s));
    if (avail.length === 0) continue;
    const src = choice(rng, avail);
    used.add(src);
    usedSources.set(w.entityId, used);
    const rec = project(rng, w, src, cfg.corruption);
    records.push(rec);
    gold.set(rec.putCode, w.entityId);
    added++;
  }

  return { records, gold, canon, dupDecisions: added };
}

// ===========================================================================
// Metrics
// ===========================================================================
interface ResearcherMetrics {
  tp: number;
  fp: number;
  fn: number;
  b3pSum: number;
  b3rSum: number;
  b3n: number;
  // field metrics (golden only, computed by caller)
  records: number;
  dupDecisions: number;
}

function pairwiseAndB3(
  records: Publication[],
  gold: Map<string, number>,
  assignment: Map<string, number>
): ResearcherMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const pcs = records.map((r) => assignment.get(r.putCode) ?? -1);
  const gcs = records.map((r) => gold.get(r.putCode) ?? -2);
  const n = records.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sp = pcs[i] === pcs[j];
      const sg = gcs[i] === gcs[j];
      if (sp && sg) tp++;
      else if (sp && !sg) fp++;
      else if (!sp && sg) fn++;
    }
  }
  // B-cubed
  const predSize = new Map<number, number>();
  const goldSize = new Map<number, number>();
  const interCount = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    predSize.set(pcs[i], (predSize.get(pcs[i]) || 0) + 1);
    goldSize.set(gcs[i], (goldSize.get(gcs[i]) || 0) + 1);
    const key = `${pcs[i]}|${gcs[i]}`;
    interCount.set(key, (interCount.get(key) || 0) + 1);
  }
  let b3pSum = 0;
  let b3rSum = 0;
  for (let i = 0; i < n; i++) {
    const inter = interCount.get(`${pcs[i]}|${gcs[i]}`) || 1;
    b3pSum += inter / (predSize.get(pcs[i]) || 1);
    b3rSum += inter / (goldSize.get(gcs[i]) || 1);
  }
  return { tp, fp, fn, b3pSum, b3rSum, b3n: n, records: n, dupDecisions: 0 };
}

interface FieldMetrics {
  doiPresent: number;
  doiCorrect: number;
  doiCorrectDenom: number;
  yearAcc: number;
  titleAcc: number;
  fusedCount: number;
  legacyCollapse: number; // titles the OLD [^\w\s] normalizer would gut (Cyrillic bug demo)
  legacyDenom: number;
}

// replicate the OLD buggy normalizer to quantify the fixed bug
const legacyNormalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, '').trim();

function fieldMetrics(
  fused: Publication[],
  gold: Map<string, number>,
  canon: Map<number, CanonWork>
): FieldMetrics {
  let doiPresent = 0;
  let doiCorrect = 0;
  let doiCorrectDenom = 0;
  let yearAcc = 0;
  let titleAcc = 0;
  let legacyCollapse = 0;
  let legacyDenom = 0;
  for (const f of fused) {
    const ent = gold.get(f.putCode);
    const c = ent !== undefined ? canon.get(ent) : undefined;
    if (canonicalizeDoi(f.doi)) doiPresent++;
    if (c) {
      if (c.doi) {
        doiCorrectDenom++;
        if (canonicalizeDoi(f.doi) === canonicalizeDoi(c.doi)) doiCorrect++;
      }
      if (f.year === c.year) yearAcc++;
      const ct = canonicalizeTitle(f.title);
      if (ct === canonicalizeTitle(c.uaTitle) || ct === canonicalizeTitle(c.enTitle)) titleAcc++;
      // legacy bug demo on the UA title
      legacyDenom++;
      const legacyWords = legacyNormalize(c.uaTitle).split(/\s+/).filter(Boolean).length;
      const realWords = c.uaTitle.split(/\s+/).filter(Boolean).length;
      if (realWords > 0 && legacyWords < realWords * 0.5) legacyCollapse++;
    }
  }
  return {
    doiPresent,
    doiCorrect,
    doiCorrectDenom,
    yearAcc,
    titleAcc,
    fusedCount: fused.length,
    legacyCollapse,
    legacyDenom,
  };
}

// ===========================================================================
// One university run for a given method
// ===========================================================================
interface RunResult {
  precision: number;
  recall: number;
  f1: number;
  b3p: number;
  b3r: number;
  b3f1: number;
  // golden-only field + efficiency (filled when method === golden)
  doiPresentRate: number;
  doiCorrectRate: number;
  yearAccRate: number;
  titleAccRate: number;
  legacyCollapseRate: number;
  machineMs: number;
  manualMinutes: number;
  reviewPairs: number;
}

// transparent manual-effort model (declared coefficients — a MODEL, not a human study)
const MANUAL_A = 2.5; // min per record to locate + verify
const MANUAL_B = 5.0; // min per duplicate-resolution decision
const MANUAL_C = 45; // min fixed setup/formatting per report

function runUniversity(seed: number, cfg: GenConfig, method: ResolveMethod): RunResult {
  GLOBAL_ENTITY = 0;
  GLOBAL_RECORD = 0;
  const rng = mulberry32(seed);
  const researchers: ResearcherData[] = [];
  for (let i = 0; i < cfg.researchers; i++) researchers.push(genResearcher(rng, cfg));

  let TP = 0;
  let FP = 0;
  let FN = 0;
  let b3pSum = 0;
  let b3rSum = 0;
  let b3n = 0;
  let machineMs = 0;
  let reviewPairs = 0;
  const fieldAgg: FieldMetrics = {
    doiPresent: 0, doiCorrect: 0, doiCorrectDenom: 0, yearAcc: 0, titleAcc: 0,
    fusedCount: 0, legacyCollapse: 0, legacyDenom: 0,
  };
  let totalRecords = 0;
  let totalDup = 0;

  for (const r of researchers) {
    const t0 = process.hrtime.bigint();
    const res = resolveER(r.records, method);
    const t1 = process.hrtime.bigint();
    machineMs += Number(t1 - t0) / 1e6;
    reviewPairs += res.reviewPairs;

    const m = pairwiseAndB3(r.records, r.gold, res.assignment);
    TP += m.tp;
    FP += m.fp;
    FN += m.fn;
    b3pSum += m.b3pSum;
    b3rSum += m.b3rSum;
    b3n += m.b3n;
    totalRecords += r.records.length;
    totalDup += r.dupDecisions;

    if (method === 'golden') {
      const fm = fieldMetrics(res.records, r.gold, r.canon);
      fieldAgg.doiPresent += fm.doiPresent;
      fieldAgg.doiCorrect += fm.doiCorrect;
      fieldAgg.doiCorrectDenom += fm.doiCorrectDenom;
      fieldAgg.yearAcc += fm.yearAcc;
      fieldAgg.titleAcc += fm.titleAcc;
      fieldAgg.fusedCount += fm.fusedCount;
      fieldAgg.legacyCollapse += fm.legacyCollapse;
      fieldAgg.legacyDenom += fm.legacyDenom;
    }
  }

  const precision = TP + FP === 0 ? 1 : TP / (TP + FP);
  const recall = TP + FN === 0 ? 1 : TP / (TP + FN);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const b3p = b3pSum / b3n;
  const b3r = b3rSum / b3n;
  const b3f1 = b3p + b3r === 0 ? 0 : (2 * b3p * b3r) / (b3p + b3r);

  const manualMinutes = MANUAL_A * totalRecords + MANUAL_B * totalDup + MANUAL_C * cfg.departments;

  return {
    precision,
    recall,
    f1,
    b3p,
    b3r,
    b3f1,
    doiPresentRate: fieldAgg.fusedCount ? fieldAgg.doiPresent / fieldAgg.fusedCount : 0,
    doiCorrectRate: fieldAgg.doiCorrectDenom ? fieldAgg.doiCorrect / fieldAgg.doiCorrectDenom : 0,
    yearAccRate: fieldAgg.fusedCount ? fieldAgg.yearAcc / fieldAgg.fusedCount : 0,
    titleAccRate: fieldAgg.fusedCount ? fieldAgg.titleAcc / fieldAgg.fusedCount : 0,
    legacyCollapseRate: fieldAgg.legacyDenom ? fieldAgg.legacyCollapse / fieldAgg.legacyDenom : 0,
    machineMs,
    manualMinutes,
    reviewPairs,
  };
}

// ===========================================================================
// Statistics (mean ± 95% CI)
// ===========================================================================
const T95: Record<number, number> = { 10: 2.262, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06, 29: 2.045, 30: 2.042 };
function meanCI(xs: number[]): { mean: number; ci: number; sd: number } {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const tCrit = T95[n - 1] || T95[Object.keys(T95).map(Number).reduce((p, c) => (Math.abs(c - (n - 1)) < Math.abs(p - (n - 1)) ? c : p))] || 2.045;
  const ci = n > 1 ? tCrit * (sd / Math.sqrt(n)) : 0;
  return { mean, ci, sd };
}
const pct = (x: number) => +(x * 100).toFixed(2);

// ===========================================================================
// Main
// ===========================================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def: number) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
  };
  return {
    seeds: get('--seeds', 30),
    sweepSeeds: get('--sweep-seeds', 12),
    researchers: get('--researchers', BASE_CONFIG.researchers),
    quick: args.includes('--quick'),
  };
}

function main() {
  const opts = parseArgs();
  const K = opts.quick ? 5 : opts.seeds;
  const KS = opts.quick ? 4 : opts.sweepSeeds;
  const cfg: GenConfig = { ...BASE_CONFIG, researchers: opts.researchers };
  const methods: ResolveMethod[] = ['doi', 'titleyear', 'golden'];
  const methodLabel: Record<ResolveMethod, string> = { doi: 'DOI-only', titleyear: 'Title+Year', golden: 'Golden Record' };

  const outDir = 'paper/benchmark';
  mkdirSync(outDir, { recursive: true });

  let gitHash = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* not a git checkout */
  }

  console.log(`\n=== ResearchIQ Synthetic Benchmark ===`);
  console.log(`Model university: ${cfg.researchers} researchers, ${cfg.departments} departments, dup=${cfg.dupRate}, corruption=${cfg.corruption}`);
  console.log(`Monte-Carlo: K=${K} seeds (sweeps KS=${KS}); code @ ${gitHash}\n`);

  // ---- Main comparison (Table T1 + T2 + T3) ----
  const rawRows: string[] = ['seed,method,precision,recall,f1,b3f1,machine_ms,manual_min'];
  const perMethod: Record<string, Record<string, number[]>> = {};
  for (const m of methods) perMethod[m] = { precision: [], recall: [], f1: [], b3f1: [], machineMs: [], manualMinutes: [], doiPresentRate: [], doiCorrectRate: [], yearAccRate: [], titleAccRate: [], legacyCollapseRate: [], reviewPairs: [] };

  for (let s = 0; s < K; s++) {
    const seed = 1000 + s;
    for (const m of methods) {
      const r = runUniversity(seed, cfg, m);
      perMethod[m].precision.push(r.precision);
      perMethod[m].recall.push(r.recall);
      perMethod[m].f1.push(r.f1);
      perMethod[m].b3f1.push(r.b3f1);
      perMethod[m].machineMs.push(r.machineMs);
      perMethod[m].manualMinutes.push(r.manualMinutes);
      perMethod[m].doiPresentRate.push(r.doiPresentRate);
      perMethod[m].doiCorrectRate.push(r.doiCorrectRate);
      perMethod[m].yearAccRate.push(r.yearAccRate);
      perMethod[m].titleAccRate.push(r.titleAccRate);
      perMethod[m].legacyCollapseRate.push(r.legacyCollapseRate);
      perMethod[m].reviewPairs.push(r.reviewPairs);
      rawRows.push(`${seed},${m},${r.precision.toFixed(4)},${r.recall.toFixed(4)},${r.f1.toFixed(4)},${r.b3f1.toFixed(4)},${r.machineMs.toFixed(2)},${r.manualMinutes.toFixed(1)}`);
    }
  }

  const t1Table: any = {};
  console.log('--- Table T1: Dedup quality by method (mean ± 95% CI, %) ---');
  console.log('method'.padEnd(16), 'Precision'.padEnd(18), 'Recall'.padEnd(18), 'F1'.padEnd(18), 'B³ F1');
  for (const m of methods) {
    const p = meanCI(perMethod[m].precision);
    const r = meanCI(perMethod[m].recall);
    const f = meanCI(perMethod[m].f1);
    const b = meanCI(perMethod[m].b3f1);
    t1Table[m] = {
      precision: { mean: pct(p.mean), ci: pct(p.ci) },
      recall: { mean: pct(r.mean), ci: pct(r.ci) },
      f1: { mean: pct(f.mean), ci: pct(f.ci) },
      b3f1: { mean: pct(b.mean), ci: pct(b.ci) },
    };
    const fmt = (x: { mean: number; ci: number }) => `${x.mean.toFixed(1)}±${x.ci.toFixed(1)}`;
    console.log(
      methodLabel[m].padEnd(16),
      fmt(t1Table[m].precision).padEnd(18),
      fmt(t1Table[m].recall).padEnd(18),
      fmt(t1Table[m].f1).padEnd(18),
      fmt(t1Table[m].b3f1)
    );
  }

  // Table T2 (golden field metrics) + T3 (efficiency)
  const g = perMethod['golden'];
  const t2 = {
    doiPresentRate: { mean: pct(meanCI(g.doiPresentRate).mean), ci: pct(meanCI(g.doiPresentRate).ci) },
    doiCorrectRate: { mean: pct(meanCI(g.doiCorrectRate).mean), ci: pct(meanCI(g.doiCorrectRate).ci) },
    yearAccRate: { mean: pct(meanCI(g.yearAccRate).mean), ci: pct(meanCI(g.yearAccRate).ci) },
    titleAccRate: { mean: pct(meanCI(g.titleAccRate).mean), ci: pct(meanCI(g.titleAccRate).ci) },
    legacyCollapseRate: { mean: pct(meanCI(g.legacyCollapseRate).mean), ci: pct(meanCI(g.legacyCollapseRate).ci) },
  };
  const machine = meanCI(g.machineMs);
  const manual = meanCI(g.manualMinutes);
  const t3 = {
    note: 'Engine time is dedup+fusion COMPUTE only (excludes network data retrieval). Manual effort is a transparent analytic MODEL with declared coefficients, not a human-subjects measurement.',
    engineSeconds: { mean: +(machine.mean / 1000).toFixed(3), ci: +(machine.ci / 1000).toFixed(3) },
    manualMinutes: { mean: +manual.mean.toFixed(1), ci: +manual.ci.toFixed(1) },
    manualHours: +(manual.mean / 60).toFixed(1),
    manualHoursPerDeptReport: +(manual.mean / cfg.departments / 60).toFixed(2),
    reviewPairsPerResearcher: +(meanCI(g.reviewPairs).mean / cfg.researchers).toFixed(1),
  };
  console.log('\n--- Table T2: Golden Record field completeness/accuracy (%, mean ± CI) ---');
  console.log(`DOI present: ${t2.doiPresentRate.mean}±${t2.doiPresentRate.ci}  | DOI correct: ${t2.doiCorrectRate.mean}±${t2.doiCorrectRate.ci}  | Year acc: ${t2.yearAccRate.mean}±${t2.yearAccRate.ci}  | Title acc: ${t2.titleAccRate.mean}±${t2.titleAccRate.ci}`);
  console.log(`Legacy Cyrillic-bug title collapse (fixed): ${t2.legacyCollapseRate.mean}±${t2.legacyCollapseRate.ci}% of UA titles would be gutted by the old normalizer`);
  console.log('\n--- Table T3: Efficiency (model) ---');
  console.log(`Engine dedup compute: ${t3.engineSeconds.mean}s/university | Modeled manual effort: ${t3.manualHours} h total (${t3.manualHoursPerDeptReport} h per dept report) | HITL review pairs/researcher: ${t3.reviewPairsPerResearcher}`);

  // ---- Sensitivity sweeps (Figures F1, F2) ----
  console.log('\n--- Sweeps ---');
  const dupSweep: any[] = [];
  for (const dr of [0.1, 0.15, 0.2, 0.25, 0.3]) {
    const f1s: number[] = [];
    const b3s: number[] = [];
    for (let s = 0; s < KS; s++) {
      const r = runUniversity(2000 + s, { ...cfg, dupRate: dr }, 'golden');
      f1s.push(r.f1);
      b3s.push(r.b3f1);
    }
    const f = meanCI(f1s);
    const b = meanCI(b3s);
    dupSweep.push({ dupRate: dr, f1: pct(f.mean), f1_ci: pct(f.ci), b3f1: pct(b.mean), b3f1_ci: pct(b.ci) });
    console.log(`dup=${dr}: F1=${pct(f.mean)}±${pct(f.ci)}  B³F1=${pct(b.mean)}±${pct(b.ci)}`);
  }
  const corrSweep: any[] = [];
  for (const cl of [0.25, 0.5, 1.0, 1.5, 2.0]) {
    const ps: number[] = [];
    const rs: number[] = [];
    for (let s = 0; s < KS; s++) {
      const r = runUniversity(3000 + s, { ...cfg, corruption: cl }, 'golden');
      ps.push(r.precision);
      rs.push(r.recall);
    }
    const p = meanCI(ps);
    const r = meanCI(rs);
    corrSweep.push({ corruption: cl, precision: pct(p.mean), precision_ci: pct(p.ci), recall: pct(r.mean), recall_ci: pct(r.ci) });
    console.log(`corruption=${cl}: P=${pct(p.mean)}±${pct(p.ci)}  R=${pct(r.mean)}±${pct(r.ci)}`);
  }

  // ---- Persist artifacts ----
  const summary = {
    generated: new Date().toISOString(),
    gitHash,
    config: { ...cfg, K, KS, manualModel: { a: MANUAL_A, b: MANUAL_B, c: MANUAL_C } },
    methodLabels: methodLabel,
    t1_dedupQuality: t1Table,
    t2_fieldMetrics: t2,
    t3_efficiency: t3,
    f1_dupSweep: dupSweep,
    f2_corruptionSweep: corrSweep,
  };
  writeFileSync(`${outDir}/metrics_summary.json`, JSON.stringify(summary, null, 2));
  writeFileSync(`${outDir}/metrics_raw.csv`, rawRows.join('\n'));
  writeFileSync(`${outDir}/config.json`, JSON.stringify(summary.config, null, 2));
  console.log(`\nArtifacts written to ${outDir}/ (metrics_summary.json, metrics_raw.csv, config.json)\n`);
}

main();
