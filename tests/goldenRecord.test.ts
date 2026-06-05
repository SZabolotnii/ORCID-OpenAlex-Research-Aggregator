/**
 * Tests for the Golden Record Entity-Resolution engine (services/goldenRecord).
 * Run with: npm test   (Node's built-in test runner via tsx).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeDoi,
  canonicalizeTitle,
  transliterate,
  authorKeySet,
  scorePair,
  resolve,
  THETA_MATCH,
  THETA_REVIEW,
} from "../services/goldenRecord";
import type { Publication } from "../types";

let seq = 0;
const mk = (o: Partial<Publication>): Publication => ({
  title: "",
  year: 2023,
  journal: null,
  type: "journal-article",
  doi: null,
  url: null,
  putCode: `p${seq++}`,
  sources: ["orcid"],
  ...o,
});

// --- canonicalization -------------------------------------------------------
test("canonicalizeDoi strips url/prefix and lowercases", () => {
  assert.equal(canonicalizeDoi("https://doi.org/10.1234/ABC"), "10.1234/abc");
  assert.equal(canonicalizeDoi("doi: 10.1000/xyz "), "10.1000/xyz");
});

test("canonicalizeDoi rejects malformed / invalid-prefix DOIs", () => {
  assert.equal(canonicalizeDoi("not-a-doi"), null);
  assert.equal(canonicalizeDoi("11.1234/x"), null); // wrong registrant prefix
  assert.equal(canonicalizeDoi("10.1/x"), null); // <4 registrant digits
  assert.equal(canonicalizeDoi(null), null);
});

test("canonicalizeTitle preserves Cyrillic (regression for the [^\\w\\s] bug)", () => {
  assert.equal(canonicalizeTitle("Нейронні  мережі!"), "нейронні мережі");
  assert.ok(canonicalizeTitle("Алгоритм").length > 0);
});

test("transliterate bridges Cyrillic → Latin deterministically", () => {
  assert.equal(transliterate("Заболотній"), "zabolotnii");
});

test("authorKeySet is invariant to order and transliteration", () => {
  const a = authorKeySet(["Заболотній С."]);
  const b = authorKeySet(["S. Zabolotnii"]);
  assert.ok(a.has("zabolo|s"));
  assert.ok(b.has("zabolo|s"));
});

// --- pairwise scoring -------------------------------------------------------
test("scorePair: identical valid DOI → high score, no conflict", () => {
  const a = mk({ title: "alpha beta gamma study", doi: "10.1234/work-x" });
  const b = mk({ title: "completely different words here", doi: "https://doi.org/10.1234/WORK-X", sources: ["openalex"] });
  const s = scorePair(a, b);
  assert.equal(s.doiConflict, false);
  assert.ok(s.score > THETA_MATCH, `score ${s.score} should exceed θ_match`);
});

test("scorePair: two different valid DOIs → conflict, low score", () => {
  const a = mk({ title: "identical title here today", doi: "10.1111/aaa", year: 2022 });
  const b = mk({ title: "identical title here today", doi: "10.2222/bbb", year: 2022, sources: ["scopus"] });
  const s = scorePair(a, b);
  assert.equal(s.doiConflict, true);
  assert.ok(s.score < 0.2, `score ${s.score} should be low under DOI conflict`);
});

// --- resolution / clustering ------------------------------------------------
test("resolve(golden) merges cross-source duplicates and fuses fields", () => {
  const a = mk({ title: "alpha beta gamma study", doi: "10.1234/work-x", citationCount: 5, sources: ["orcid"] });
  const b = mk({ title: "alpha beta gamma study", doi: "10.1234/work-x", citationCount: 12, sources: ["openalex"] });
  const { records } = resolve([a, b], "golden");
  assert.equal(records.length, 1);
  assert.equal(records[0].citationCount, 12); // max
  assert.deepEqual([...records[0].sources].sort(), ["openalex", "orcid"]);
  assert.ok((records[0].provenance?.matchScore ?? 0) >= THETA_MATCH);
  assert.ok(!records[0].provenance?.reviewFlag);
  assert.equal(records[0].provenance?.clusterSize, 2);
});

test("resolve(golden) NEVER auto-merges a hard DOI conflict (fail-fast guard)", () => {
  const a = mk({ title: "identical title here today", doi: "10.1111/aaa", year: 2022 });
  const b = mk({ title: "identical title here today", doi: "10.2222/bbb", year: 2022, sources: ["scopus"] });
  assert.equal(resolve([a, b], "golden").records.length, 2);
});

test("resolve(golden) flags an unresolved near-duplicate for HITL review", () => {
  // 'neural network optimization' vs 'neural network' scores ≈0.88 ∈ [θ_review,θ_match)
  const a = mk({ title: "neural network optimization" });
  const b = mk({ title: "neural network" });
  const { records, reviewPairs } = resolve([a, b], "golden");
  assert.equal(records.length, 2, "borderline pair must NOT auto-merge");
  assert.ok(reviewPairs >= 1);
  assert.equal(records.every((r) => r.provenance?.reviewFlag === true), true);
});

test("resolve(golden) singletons: matchScore 0, no review flag", () => {
  const a = mk({ title: "a lone unique paper title", doi: "10.9999/solo" });
  const { records, reviewPairs } = resolve([a], "golden");
  assert.equal(records.length, 1);
  assert.equal(records[0].provenance?.matchScore, 0);
  assert.ok(!records[0].provenance?.reviewFlag);
  assert.equal(reviewPairs, 0);
});

test("resolve assigns every input record to a cluster", () => {
  const recs = [
    mk({ title: "x", doi: "10.1234/a" }),
    mk({ title: "x", doi: "10.1234/a", sources: ["scopus"] }),
    mk({ title: "y", doi: "10.1234/b" }),
  ];
  const { assignment } = resolve(recs, "golden");
  for (const r of recs) assert.ok(assignment.has(r.putCode));
});

test("baseline methods: doi merges only exact DOI; titleyear needs same title+year", () => {
  const a = mk({ title: "alpha beta gamma study", doi: "10.1234/work-x" });
  const b = mk({ title: "completely different words here", doi: "10.1234/work-x", sources: ["openalex"] });
  assert.equal(resolve([a, b], "doi").records.length, 1); // same DOI → merged
  assert.equal(resolve([a, b], "titleyear").records.length, 2); // different titles → not merged

  const c = mk({ title: "same exact title", year: 2020, doi: null });
  const d = mk({ title: "same exact title", year: 2021, doi: null, sources: ["openalex"] });
  assert.equal(resolve([c, d], "titleyear").records.length, 1); // |Δyear|≤1 → merged
});

test("thresholds are ordered as the formalism requires", () => {
  assert.ok(THETA_MATCH > THETA_REVIEW);
});
