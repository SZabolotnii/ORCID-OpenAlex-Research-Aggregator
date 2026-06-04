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
