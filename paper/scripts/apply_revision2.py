#!/usr/bin/env python3
"""
Assemble the round-2 revision of the ITLT manuscript (submission 6755).

Reads   paper/ITLT_TRACE_ITZN_revision1.docx   (the version uploaded in round 1)
Writes  paper/ITLT_TRACE_ITZN_revision2.docx

Round-1 blue highlighting is removed, the 30 pending tracked insertions (citation numbers
inherited from the original submission) are accepted, and every fragment added or changed
in round 2 is coloured blue. Texts: paper/scripts/revision2_texts.py; decisions and the
audit of the efficiency fragment: paper/reviews/round2-2026-11-07/.

Run from the repository root:  PYTHONPATH=paper/scripts python3 paper/scripts/apply_revision2.py
"""
import copy
import sys

from docx import Document
from docx.shared import Emu
from docx.text.paragraph import Paragraph
from docx.text.run import Run

import apply_revision as r1
import revision2_texts as T

SRC = "paper/ITLT_TRACE_ITZN_revision1.docx"
DST = "paper/ITLT_TRACE_ITZN_revision2.docx"
FIGDIR = "paper/figures"
W = r1.W
BLUE = r1.BLUE

# figure 3 (the management model) is inserted after figure 2; table 3 after table 2
r1.FIG_MAP = {3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9}
r1.TBL_MAP = {3: 4, 4: 5, 5: 6, 6: 7, 7: 8}

FIG_FILES = {  # caption prefix (after renumbering) -> image
    "Рис. 1.": "concept_map.png",
    "Рис. 2.": "arch_trace.png",
    "Рис. 4.": "researchiq_app_architecture.png",
    "Рис. 5.": "er_pipeline.png",
    "Рис. 6.": "f4_threshold_sensitivity.png",
    "Рис. 7.": "f3_method_comparison.png",
    "Рис. 8.": "f1_dup_sensitivity.png",
    "Рис. 9.": "f2_corruption_sensitivity.png",
}


# --------------------------------------------------------------------------
def accept_insertions(doc):
    n = 0
    for ins in list(doc.element.body.iter(W + "ins")):
        parent = ins.getparent()
        idx = parent.index(ins)
        for child in list(ins):
            parent.insert(idx, child)
            idx += 1
        parent.remove(ins)
        n += 1
    return n


def reset_blue(doc):
    n = 0
    for c in doc.element.body.iter(W + "color"):
        if (c.get(W + "val") or "").upper() == "0000FF":
            c.getparent().remove(c)
            n += 1
    return n


def all_runs(par):
    return [Run(r, par) for r in par._p.findall(".//" + W + "r")]


_SPACES = str.maketrans({" ": " ", " ": " ", " ": " ", " ": " "})


def replace_runs(par, old, pieces):
    """Replace the first occurrence of `old` (even across runs) with fresh coloured runs.

    `pieces` is a list of (text, subscript) pairs. Text outside the match keeps its
    original runs and colour, so only the changed fragment is highlighted.
    """
    runs = all_runs(par)
    spans, pos = [], 0
    for r in runs:
        spans.append((r, pos, pos + len(r.text)))
        pos += len(r.text)
    text = "".join(r.text for r in runs)
    # spaces after the DOCX conversion are a mix of normal, no-break, thin and six-per-em;
    # match on a 1:1 normalised copy so that indices stay valid
    i = text.translate(_SPACES).find(old.translate(_SPACES))
    if i < 0:
        return False
    j = i + len(old)
    first = None
    for r, a, b in spans:
        if b <= i or a >= j:
            continue
        lo, hi = max(i, a) - a, min(j, b) - a
        if first is None:
            first = (r, lo)
        r.text = r.text[:lo] + r.text[hi:]
    r0, lo = first
    # split r0 at lo: r0 keeps [:lo], a clone carries [lo:]
    tail_text = r0.text[lo:]
    r0.text = r0.text[:lo]
    anchor = r0._r
    rpr = r0._r.rPr
    for txt, sub in pieces:
        nr = copy.deepcopy(r0._r)
        for ch in list(nr):
            if ch.tag != W + "rPr":
                nr.remove(ch)
        run = Run(nr, par)
        va = nr.find(f"{W}rPr/{W}vertAlign")
        if va is not None:
            va.getparent().remove(va)
        run.text = txt
        run.font.color.rgb = BLUE
        if sub:
            run.font.subscript = True
        anchor.addnext(nr)
        anchor = nr
    if tail_text:
        tr = copy.deepcopy(r0._r)
        for ch in list(tr):
            if ch.tag != W + "rPr":
                tr.remove(ch)
        Run(tr, par).text = tail_text
        anchor.addnext(tr)
    return True


def replace_all(par, old, new):
    n = 0
    while replace_runs(par, old, [(new, False)]):
        n += 1
    return n


def fix_theta(par):
    n = 0
    for old, sub in (("θmatch", "зл"), ("θreview", "пер")):
        while replace_runs(par, old, [("θ", False), (sub, True)]):
            n += 1
    # round-2 texts already use θзл/θпер, typed flat; subscript them only while the
    # symbol still sits inside one run (a subscripted one is split over two runs)
    for flat, sub in (("θзл", "зл"), ("θпер", "пер")):
        while any(flat in r.text for r in all_runs(par)):
            r = next(r for r in all_runs(par) if flat in r.text)
            colour = r.font.color.rgb if r.font.color and r.font.color.type else None
            k = r.text.index(flat)
            tail = r.text[k + len(flat):]
            r.text = r.text[:k] + "θ"
            nr = copy.deepcopy(r._r)
            nrun = Run(nr, par)
            nrun.text = sub
            nrun.font.subscript = True
            r._r.addnext(nr)
            if tail:
                tr = copy.deepcopy(r._r)
                Run(tr, par).text = tail
                nr.addnext(tr)
            n += 1
    return n


def para(doc, prefix):
    return r1.para_by_prefix(doc, prefix)


def set_text(par, text):
    """Replace the whole paragraph content with one blue run.

    Unlike apply_revision.set_text, this also removes runs nested in <w:hyperlink>
    (cross-reference links from the original conversion), which would otherwise survive.
    """
    rpr = None
    for r in par._p.iter(W + "r"):
        if r.find(W + "rPr") is not None:
            rpr = copy.deepcopy(r.find(W + "rPr"))
            break
    for child in list(par._p):
        if child.tag != W + "pPr":
            par._p.remove(child)
    run = par.add_run(text)
    if rpr is not None:
        for v in rpr.findall(W + "vertAlign"):
            rpr.remove(v)
        run._r.insert(0, rpr)
    run.font.color.rgb = BLUE
    return par


def ua_paragraphs(doc):
    ps = doc.paragraphs
    idx = lambda s: next(i for i, p in enumerate(ps) if s in p.text)
    body = ps[idx("1. ВСТУП"):idx("ДЕКЛАРАЦІЯ ГЕНЕРАТИВНОГО")]
    appx = ps[idx("ДОДАТОК"):idx("Text of the article was accepted")]
    cells = [cp for t in doc.tables for row in t.rows for c in row.cells for cp in c.paragraphs]
    # merged cells repeat; keep each paragraph once
    seen, uniq = set(), []
    for p in body + appx + cells:
        if id(p._p) not in seen:
            seen.add(id(p._p))
            uniq.append(p)
    return uniq


def replace_picture(img_par, image):
    drawing = img_par._p.find(".//" + W + "drawing")
    ext = drawing.find(".//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent")
    cx = int(ext.get("cx"))
    rids = [b.get(f"{_R}embed") for b in drawing.iter(f"{_A}blip")]
    for r in list(img_par._p.findall(W + "r")):
        if r.find(".//" + W + "drawing") is not None:
            r.getparent().remove(r)
    img_par.add_run().add_picture(image, width=Emu(cx))
    return rids


_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def drop_unused_images(doc, rids):
    """Remove relationships (and so the stored parts) of images no longer referenced."""
    used = {b.get(f"{_R}embed") for b in doc.element.body.iter(f"{_A}blip")}
    dropped = 0
    for rid in rids:
        if rid and rid not in used and rid in doc.part.rels:
            doc.part.drop_rel(rid)
            dropped += 1
    return dropped


def new_table(doc, anchor, rows, tbl_template, cell_rpr):
    tbl = r1.new_table(doc, anchor, rows, tbl_template, cell_rpr)
    return tbl


def tidy_table(tbl, widths_cm):
    """Header row bold, body rows regular; fixed column widths.

    Round-1 tables were built with the header's run properties for every cell, so their
    whole body came out bold; this restores the convention of the original tables.
    """
    from docx.shared import Cm
    for i, row in enumerate(tbl.rows):
        for c, cell in enumerate(row.cells):
            cell.width = Cm(widths_cm[c])
            if i == 0:
                continue
            for p in cell.paragraphs:
                for r in p.runs:
                    r.bold = False
    grid = tbl._tbl.find(W + "tblGrid")
    if grid is not None:
        for gc, w in zip(grid.findall(W + "gridCol"), widths_cm):
            gc.set(W + "w", str(int(w * 567)))


# --------------------------------------------------------------------------
def main():
    doc = Document(SRC)
    print(f"accepted tracked insertions: {accept_insertions(doc)}")
    print(f"round-1 blue runs reset: {reset_blue(doc)}")

    # ---- renumbering ------------------------------------------------------
    n = 0
    for p in doc.paragraphs:
        n += r1.renumber_paragraph(p)
    for t in doc.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs:
                    n += r1.renumber_paragraph(p)
    print(f"renumbered references: {n}")

    # ---- styles taken from existing paragraphs ----------------------------
    body_style = para(doc, "Проактивна модель управління науковою діяльністю натомість")
    head_style = para(doc, "Реактивна та проактивна моделі управління")
    cap1 = para(doc, "Рис. 1.")
    img_style = doc.paragraphs[[p._p for p in doc.paragraphs].index(cap1._p) - 1]
    tnum_style = para(doc, "Таблиця 2")
    tname_style = doc.paragraphs[[p._p for p in doc.paragraphs].index(tnum_style._p) + 1]
    tbl_template = doc.tables[0]
    cell_rpr = None
    for r in tbl_template.rows[1].cells[0].paragraphs[0].runs:
        if r._r.rPr is not None:
            cell_rpr = copy.deepcopy(r._r.rPr)
            break
    if cell_rpr is not None:
        for c in cell_rpr.findall(W + "color"):
            cell_rpr.remove(c)

    # ---- abstracts ---------------------------------------------------------
    ab = para(doc, "Анотація.")
    for old, new in T.ABSTRACT_UA:
        assert replace_runs(ab, old, [(new, False)]), old
    abe = para(doc, "Abstract.")
    for old, new in T.ABSTRACT_EN:
        assert replace_runs(abe, old, [(new, False)]), old

    # ---- aim / outline -----------------------------------------------------
    assert replace_runs(para(doc, "обґрунтувати концептуальну модель"), T.TASK1_OLD, [(T.TASK1_NEW, False)])
    assert replace_runs(para(doc, "Методологічним підґрунтям"), T.OUTLINE_OLD, [(T.OUTLINE_NEW, False)])

    # ---- new subsection: the management model (before section 3) ----------
    meth = para(doc, "3. МЕТОДИКА")
    h = r1.new_para(doc, meth, T.MODEL_HEADING, before=True, style_from=head_style)
    cur = h
    for txt in T.MODEL:
        cur = r1.new_para(doc, cur, txt, style_from=body_style)
    cap = r1.new_figure(doc, cur, f"{FIGDIR}/management_model.png", T.FIG_MODEL_CAPTION, 16.0,
                        img_style, cap1)
    tcap = r1.caption_block(doc, cap, "Таблиця 3", T.T_MODEL_TITLE, tnum_style, tname_style)
    new_table(doc, tcap, T.T_MODEL_ROWS, tbl_template, cell_rpr)
    # tables 1-4 after insertion: comparison, glossary, model components, component status
    for tbl, widths in zip(doc.tables[:4], ([4.5, 4.5, 7.0], [4.0, 8.5, 3.5],
                                            [3.0, 3.4, 2.8, 2.8, 4.0], [6.0, 4.0, 6.0])):
        tidy_table(tbl, widths)

    # ---- agent paragraph, practical value, reproducibility, prospects ------
    set_text(para(doc, T.AGENT_PARA_PREFIX), T.AGENT_PARA)
    set_text(para(doc, T.REPRO_PREFIX), T.REPRO)
    assert replace_runs(para(doc, "Теоретичний внесок"), T.PRACT_OLD, [(T.PRACT_NEW, False)])
    p2 = para(doc, "Другим самостійним завданням")
    assert replace_runs(p2, T.PERSP2_DROP, [(T.PERSP2_NEW, False)]), "persp2"
    ev = para(doc, "Зовнішня валідність.")
    assert replace_runs(ev, T.EXTVAL_DROP, []), "extval"
    assert replace_runs(para(doc, "Рис. 5. Конвеєр"), T.FIG4_CAPTION_OLD, [(T.FIG4_CAPTION_NEW, False)])
    assert replace_runs(para(doc, "де σ(⋅)"), T.EQ_WHERE_OLD, [(T.EQ_WHERE_NEW, False)])

    # ---- efficiency fragment (R1.2-6) -------------------------------------
    set_text(para(doc, "Ефективність та обчислювальна ощадливість."), T.EFFICIENCY)
    assert replace_runs(para(doc, "Час рушія охоплює лише обчислення"), T.APPENDIX_NOTE_OLD,
                        [(T.APPENDIX_NOTE_NEW, False)])
    set_text(para(doc, "Ефективність: рушій (виміряно)"), T.T8_TITLE)
    t8 = next(t for t in doc.tables if any("Час рушія" in c.text for row in t.rows for c in row.cells))
    for row in t8.rows:
        if "Час рушія" in row.cells[0].text:
            set_text(row.cells[1].paragraphs[0], T.T8_ENGINE)
    last = t8.rows[-1]._tr
    nr = copy.deepcopy(last)
    last.addnext(nr)
    from docx.table import _Row
    row = _Row(nr, t8)
    for cell, txt in zip(row.cells, T.T8_NEW_ROW):
        set_text(cell.paragraphs[0], txt)

    # ---- conclusions (R1.2-5) ---------------------------------------------
    set_text(para(doc, "У статті обґрунтовано та апробовано"), T.CONCL_OPEN)
    set_text(para(doc, T.CONCL_1_PREFIX), T.CONCL_1)
    set_text(para(doc, T.CONCL_5_PREFIX), T.CONCL_5)
    set_text(para(doc, T.CONCL_6_PREFIX), T.CONCL_6)

    # ---- anglicisms + notation (R1.2-4), Ukrainian part only ---------------
    ua = ua_paragraphs(doc)
    hits = {}
    for old, new in T.ANGLICISMS:
        for p in ua:
            k = replace_all(p, old, new)
            if k:
                hits[old] = hits.get(old, 0) + k
    missing = [o for o, _ in T.ANGLICISMS if o not in hits]
    print(f"anglicism replacements: {sum(hits.values())}; patterns without a hit: {len(missing)}")
    for m in missing:
        print("   no hit:", m[:70])
    th = sum(fix_theta(p) for p in ua)
    print(f"theta notation: {th}")
    # the matching equation is OMML: score -> s
    M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
    for t in doc.element.body.iter(M + "t"):
        if t.text and "score" in t.text:
            t.text = t.text.replace("score", "s")

    # ---- volume budget: condense repeated material (texts are post-terminology) ----
    for pref, old, new in T.CUTS:
        assert replace_runs(para(doc, pref), old, [(new, False)] if new else []), (pref, old[:40])

    # ---- figures: rebuilt in Ukrainian ------------------------------------
    replaced, old_rids = 0, []
    ps = doc.paragraphs
    for i, p in enumerate(ps):
        for pref, img in FIG_FILES.items():
            if p.text.strip().startswith(pref):
                j = i - 1
                while ps[j]._p.find(".//" + W + "drawing") is None:
                    j -= 1
                old_rids += replace_picture(ps[j], f"{FIGDIR}/{img}")
                replaced += 1
    print(f"figures replaced: {replaced} / {len(FIG_FILES)}; "
          f"old image parts dropped: {drop_unused_images(doc, old_rids)}")

    doc.save(DST)
    print(f"written {DST}")


if __name__ == "__main__":
    sys.exit(main())
