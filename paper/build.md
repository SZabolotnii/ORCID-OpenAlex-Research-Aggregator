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

## ITLT journal variant with TRACE (`itlt_trace/`)

`itlt_trace/` is the journal-conformant variant for **Information Technologies and
Learning Tools (ITLT)**, derived from the TRACE manuscript: ITLT structure
(Introduction / Theoretical backgrounds + Methods / Findings / Conclusions),
UA + EN structured abstracts and keywords (~21 pp. incl. appendix). It puts the
TRACE engineering framework front and centre: the goal statement and a dedicated
task call it out explicitly, the Methods carry a four-layer architecture figure
(`figures/arch_trace.pdf` — L1 deterministic core / L2a classical ML / L2b LLM
validator / L3–L4 escalation + human oversight), plus the Model-Parsimony
principle and CPR. To keep the body short, the **full quantitative evaluation**
(Monte-Carlo result tables + sensitivity figures f1/f2/f3) lives in **Appendix A**
(`sections/05_appendix.tex`); the Findings body keeps only a qualitative summary
with headline numbers + threats to validity, pointing to the appendix. The
variant links the open-source repo and does **not** carry the extended TRACE
chapter or formalism (those stay in `main_trace.tex`).

The architecture figure is generated from a standalone TikZ source
(`figures/arch_trace.tex`) to keep `main.tex` `\includegraphics`-only and
DOCX-convertible:

```bash
cd paper/figures && xelatex arch_trace.tex   # regenerate arch_trace.pdf
```

Build (XeLaTeX; final ITLT references are maintained manually in
`references_itlt.tex` so that language tags, DOI/URL fields and the journal's
`REFERENCES (TRANSLATED AND TRANSLITERATED)` heading survive exactly):

```bash
cd paper/itlt_trace
latexmk -xelatex -interaction=nonstopmode -outdir=build_xe main.tex
cp -f build_xe/main.pdf ../artifacts/ResearchIQ_ITLT_TRACE.pdf
```

Submission DOCX:

```bash
cd paper/itlt_trace
pandoc main.tex --from=latex --to=docx --resource-path=.:.. \
  --reference-doc='../submission-rules/template_itlt_en 2026-OTH.docx' \
  -o build_xe/main_raw.docx
/opt/homebrew/bin/python3 scripts/normalize_itlt_docx.py \
  build_xe/main_raw.docx \
  ../artifacts/ResearchIQ_ITLT_TRACE_submission.docx
```

The normalizer enforces the ITLT Word constraints that Pandoc does not preserve
reliably: A4, 2.5 cm margins, Times New Roman, single spacing, no page numbering
or header/footer references, 10 pt abstract/reference blocks, first-line body
indent, and numbered final references.
