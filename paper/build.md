---
title: "ResearchIQ LaTeX build (reproducible)"
type: knowledge
status: active
tags:
  - product:researchiq
related: [02_distill/research/researchiq]
---

# ResearchIQ LaTeX build (reproducible)

## Prerequisites

- `tectonic` (this repo uses Tectonic because full TeXLive/latexmk is not assumed to be installed)

## One-command build

From this directory:

```bash
tectonic --keep-intermediates --keep-logs --reruns 2 -o build main.tex
cp -f build/main.pdf artifacts/ResearchIQ_ORCID_OpenAlex_Research_Aggregator.pdf
```

Notes:
- Bibliography is built with **BibTeX** (via `natbib` + `unsrt.bst`) to avoid the `biblatex+biber` dependency.
- The `--reruns 2` setting ensures cross-references and citations stabilize.

## TRACE-emphasis variant

`main_trace.tex` is a second, additive variant that emphasises the engineering of
the system within the **TRACE** framework. It reuses every base section unchanged
and only adds `sections/11_trace_engineering.tex` (a standalone chapter mapping
ResearchIQ onto the TRACE layers L1–L4, the L2a/L2b parsimony split, the trust-metric
subset and CPR) plus `references_trace.bib`. The base `main.tex` is untouched.

```bash
tectonic --keep-intermediates --keep-logs --reruns 2 -o build main_trace.tex
cp -f build/main_trace.pdf artifacts/ResearchIQ_TRACE_variant.pdf
```
