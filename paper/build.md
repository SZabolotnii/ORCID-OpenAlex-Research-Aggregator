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

`main_trace.tex` is a second variant that threads the **TRACE** line through the
whole manuscript (problem statement → architecture → evaluation → conclusions),
with the framework as the architectural backbone.

Mechanism: a single switch `\newif\iftrace`. The base `main.tex` sets `\tracefalse`,
so every `\iftrace ... \fi` block in the shared sections renders nothing and the
base PDF is byte-identical. `main_trace.tex` sets `\tracetrue`, enabling:
- woven TRACE blocks in the intro, methodology (§1.5), the reference architecture
  (§4.5 + the four-layer figure `fig:trace-arch`), validation (§5.2) and conclusions;
- a consolidated chapter `sections/11_trace_engineering.tex` (РОЗДІЛ 7) with the
  layer decomposition, the L2a/L2b parsimony decision, the trust-metric subset and CPR;
- the extra bibliography `references_trace.bib`.

No section content is duplicated; the base variant output is unchanged.

```bash
tectonic --keep-intermediates --keep-logs --reruns 2 -o build main_trace.tex
cp -f build/main_trace.pdf artifacts/ResearchIQ_TRACE_variant.pdf
```

## Fallback: XeLaTeX + latexmk (no Tectonic)

If Tectonic's support bundle is unreachable, build with a standard TeX Live
XeLaTeX toolchain instead. On Debian/Ubuntu:

```bash
sudo apt-get install -y --no-install-recommends \
  texlive-xetex texlive-latex-recommended texlive-latex-extra \
  texlive-fonts-recommended texlive-lang-cyrillic texlive-pictures \
  texlive-bibtex-extra latexmk fonts-dejavu-core fonts-dejavu-extra

# fonts-dejavu-extra provides DejaVu Serif *Italic* (core ships only Book+Bold),
# otherwise \emph / \textit fall back to upright.

cd paper
latexmk -xelatex -bibtex -interaction=nonstopmode -outdir=build_xe main.tex
latexmk -xelatex -bibtex -interaction=nonstopmode -outdir=build_xe main_trace.tex
cp -f build_xe/main.pdf       artifacts/ResearchIQ_ORCID_OpenAlex_Research_Aggregator.pdf
cp -f build_xe/main_trace.pdf artifacts/ResearchIQ_TRACE_variant.pdf
```

`latexmk` runs XeLaTeX + BibTeX with enough reruns to stabilise cross-references
and citations. Current page counts: base ≈ 56 pp., TRACE variant ≈ 65 pp.
