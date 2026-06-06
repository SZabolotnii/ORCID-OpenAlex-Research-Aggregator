/**
 * Tests for services/dataMergeService — the production wrapper around the Golden
 * Record engine plus the HITL review surfacing helper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePublications, reviewFlaggedPublications } from "../services/dataMergeService";
import { resolve } from "../services/goldenRecord";
import type { Publication } from "../types";

let seq = 0;
const mk = (o: Partial<Publication>): Publication => ({
  title: "",
  year: 2023,
  journal: null,
  type: "journal-article",
  doi: null,
  url: null,
  putCode: `m${seq++}`,
  sources: ["orcid"],
  ...o,
});

test("mergePublications collapses a cross-source duplicate into one Golden Record", () => {
  const existing = [mk({ title: "shared work title", doi: "10.1234/shared", citationCount: 3, sources: ["orcid"] })];
  const incoming = [mk({ title: "shared work title", doi: "10.1234/shared", citationCount: 9 })];
  const out = mergePublications(existing, incoming, "openalex");
  assert.equal(out.length, 1);
  assert.equal(out[0].citationCount, 9); // max citations win
  assert.deepEqual([...out[0].sources].sort(), ["openalex", "orcid"]);
});

test("mergePublications tags incoming records with the new source name", () => {
  const incoming = [mk({ title: "brand new paper", doi: "10.1234/new", sources: [] as any })];
  const out = mergePublications([], incoming, "scopus");
  assert.equal(out.length, 1);
  assert.ok(out[0].sources.includes("scopus"));
});

test("mergePublications keeps genuinely distinct works separate", () => {
  const existing = [mk({ title: "first distinct work", doi: "10.1234/a" })];
  const incoming = [mk({ title: "second distinct work", doi: "10.1234/b" })];
  assert.equal(mergePublications(existing, incoming, "openalex").length, 2);
});

test("reviewFlaggedPublications surfaces only records flagged for HITL review", () => {
  // borderline pair → both Golden Records carry reviewFlag === true
  const a = mk({ title: "neural network optimization" });
  const b = mk({ title: "neural network" });
  const flaggedRecords = resolve([a, b], "golden").records;
  assert.equal(reviewFlaggedPublications(flaggedRecords).length, 2);

  // a clean, confidently-merged record is not surfaced
  const clean = resolve(
    [mk({ title: "clean work", doi: "10.1234/clean" }), mk({ title: "clean work", doi: "10.1234/clean", sources: ["scopus"] })],
    "golden"
  ).records;
  assert.equal(reviewFlaggedPublications(clean).length, 0);
});
