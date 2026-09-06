#!/usr/bin/env python3
"""
Assemble the revised ITLT manuscript (round-1 review, submission 6755).

Reads   paper/ITLT_TRACE_ITZN_final_summision.docx   (author's full version)
Writes  paper/ITLT_TRACE_ITZN_revision1.docx

Every added or replaced fragment is coloured blue, as the editorial office requires.
The source text of the fragments is paper/reviews/round1-2026-09-04/07_revision-text.md
(and 05_sensitivity-results.md for the R2-1/R2-2/R2-3 paragraphs).

Run: python3 paper/scripts/apply_revision.py
"""
import copy
import re
import sys
from docx import Document
from docx.shared import Cm, RGBColor

SRC = "paper/ITLT_TRACE_ITZN_final_summision.docx"
DST = "paper/ITLT_TRACE_ITZN_revision1.docx"
FIGDIR = "paper/figures"
BLUE = RGBColor(0x00, 0x00, 0xFF)

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# --------------------------------------------------------------------------
# renumbering maps (new items inserted before existing ones shift the numbers)
# --------------------------------------------------------------------------
FIG_MAP = {1: 2, 2: 3, 3: 6, 4: 7, 5: 8}
TBL_MAP = {1: 4, 2: 5, 3: 6, 4: 7}
NUMPAT = re.compile(r"(Рис\.|рис\.|Таблиця|таблиця|Табл\.|табл\.)([\s\xa0 ]*)(\d+(?:[\s\xa0]*,[\s\xa0]*\d+)*)")


def renumber_paragraph(par):
    """Renumber figure/table references even when the pattern spans several runs.

    Every mapping is single-digit -> single-digit, so digits are rewritten in place
    and no run boundary has to move.
    """
    # include runs nested in <w:hyperlink> (pandoc renders cross-references that way)
    from docx.text.run import Run
    runs = [Run(r, par) for r in par._p.findall(".//" + W + "r")]
    if not runs:
        return 0
    spans, pos = [], 0
    for r in runs:
        spans.append((r, pos, pos + len(r.text)))
        pos += len(r.text)
    text = "".join(r.text for r in runs)
    edits = {}
    for m in NUMPAT.finditer(text):
        word = m.group(1)
        mp = FIG_MAP if word.lower().startswith("рис") else TBL_MAP
        base = m.start(3)
        for num in re.finditer(r"\d+", m.group(3)):
            if len(num.group(0)) != 1:      # multi-digit: leave alone, nothing maps there
                continue
            old_d = int(num.group(0))
            if old_d in mp:
                edits[base + num.start()] = str(mp[old_d])
    if not edits:
        return 0
    chars = list(text)
    for i, ch in edits.items():
        chars[i] = ch
    new_text = "".join(chars)
    for r, a, b in spans:
        if new_text[a:b] != r.text:
            r.text = new_text[a:b]
    return len(edits)


def renumber(text):
    def sub(m):
        word, gap, nums = m.group(1), m.group(2), m.group(3)
        mp = FIG_MAP if word.lower().startswith("рис") else TBL_MAP
        parts = re.split(r"([\s\xa0]*,[\s\xa0]*)", nums)
        out = []
        for part in parts:
            if part.strip().isdigit():
                out.append(str(mp.get(int(part.strip()), int(part.strip()))))
            else:
                out.append(part)
        return word + gap + "".join(out)
    return NUMPAT.sub(sub, text)


# --------------------------------------------------------------------------
# low-level docx helpers
# --------------------------------------------------------------------------
def para_by_prefix(doc, prefix, start=0):
    for i, p in enumerate(doc.paragraphs[start:], start):
        if p.text.strip().startswith(prefix):
            return p
    raise LookupError(f"anchor not found: {prefix!r}")


def _rpr_template(par):
    for r in par.runs:
        if r._r.rPr is not None:
            return copy.deepcopy(r._r.rPr)
    return None


def set_text(par, text, colour=BLUE):
    """Replace a paragraph's content with one coloured run, keeping its formatting."""
    rpr = _rpr_template(par)
    for r in list(par.runs):
        r._r.getparent().remove(r._r)
    run = par.add_run(text)
    if rpr is not None:
        run._r.insert(0, copy.deepcopy(rpr))
    run.font.color.rgb = colour
    return par


def new_para(doc, anchor, text, before=False, style_from=None, colour=BLUE):
    """Insert a paragraph after (or before) `anchor`, copying its paragraph formatting."""
    src = style_from if style_from is not None else anchor
    p = copy.deepcopy(src._p)
    for child in list(p):
        if child.tag != W + "pPr":
            p.remove(child)
    if before:
        anchor._p.addprevious(p)
    else:
        anchor._p.addnext(p)
    from docx.text.paragraph import Paragraph
    par = Paragraph(p, anchor._parent)
    rpr = _rpr_template(src)
    run = par.add_run(text)
    if rpr is not None:
        run._r.insert(0, copy.deepcopy(rpr))
    run.font.color.rgb = colour
    return par


def replace_across_runs(par, old, new, colour=BLUE):
    """Replace `old` with `new` even when the phrase is split over several runs."""
    from docx.text.run import Run
    runs = [Run(r, par) for r in par._p.findall(".//" + W + "r")]
    if not runs:
        return False
    spans, pos = [], 0
    for r in runs:
        spans.append((r, pos, pos + len(r.text)))
        pos += len(r.text)
    text = "".join(r.text for r in runs)
    i = text.find(old)
    if i < 0:
        return False
    j = i + len(old)
    first = True
    for r, a, b in spans:
        if b <= i or a >= j:
            continue
        lo, hi = max(i, a) - a, min(j, b) - a
        if first:
            r.text = r.text[:lo] + new + r.text[hi:]
            if colour is not None:
                r.font.color.rgb = colour
            first = False
        else:
            r.text = r.text[:lo] + r.text[hi:]
    return True


def new_para_after_el(el, text, style_from, parent):
    """Insert a paragraph directly after an arbitrary body element (e.g. a table)."""
    p = copy.deepcopy(style_from._p)
    for child in list(p):
        if child.tag != W + "pPr":
            p.remove(child)
    el.addnext(p)
    from docx.text.paragraph import Paragraph
    par = Paragraph(p, parent)
    rpr = _rpr_template(style_from)
    run = par.add_run(text)
    if rpr is not None:
        run._r.insert(0, copy.deepcopy(rpr))
    run.font.color.rgb = BLUE
    return par


def new_paras(doc, anchor, texts, before=False, style_from=None):
    """Insert several paragraphs, keeping their order."""
    out = []
    cur = anchor
    if before:
        for t in texts:
            out.append(new_para(doc, anchor, t, before=True, style_from=style_from))
        return out
    for t in texts:
        cur = new_para(doc, cur, t, style_from=style_from)
        out.append(cur)
    return out


def new_table(doc, anchor, rows, tbl_template, cell_rpr):
    """Insert a table after `anchor`, cloning the formatting of an existing table."""
    tbl = doc.add_table(rows=len(rows), cols=len(rows[0]))
    tblpr_new = tbl._tbl.find(W + "tblPr")
    tblpr_src = tbl_template._tbl.find(W + "tblPr")
    if tblpr_src is not None:
        tbl._tbl.replace(tblpr_new, copy.deepcopy(tblpr_src))
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            par = cell.paragraphs[0]
            run = par.add_run(val)
            if cell_rpr is not None:
                run._r.insert(0, copy.deepcopy(cell_rpr))
            run.font.color.rgb = BLUE
            if r == 0:
                run.font.bold = True
    anchor._p.addnext(tbl._tbl)
    return tbl


def new_figure(doc, anchor, image, caption, width_cm, img_style, cap_style):
    """Insert an image paragraph + caption after `anchor`."""
    img_par = new_para(doc, anchor, "", style_from=img_style)
    for r in list(img_par.runs):
        r._r.getparent().remove(r._r)
    run = img_par.add_run()
    run.add_picture(image, width=Cm(width_cm))
    cap_par = new_para(doc, img_par, caption, style_from=cap_style)
    return cap_par


def caption_block(doc, anchor, number_text, title_text, num_style, name_style):
    """ITLT table caption: «Таблиця N» (right, italic) + bold centred title."""
    p1 = new_para(doc, anchor, number_text, style_from=num_style)
    p2 = new_para(doc, p1, title_text, style_from=name_style)
    return p2


# --------------------------------------------------------------------------
def main():
    doc = Document(SRC)

    # ---- 0. renumber every existing figure/table reference -----------------
    changed = 0
    for par in doc.paragraphs:
        changed += renumber_paragraph(par)
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for par in cell.paragraphs:
                    changed += renumber_paragraph(par)
    print(f"renumbered references: {changed}")

    tbl_template = doc.tables[0]
    cell_rpr = None
    for r in doc.tables[0].rows[0].cells[0].paragraphs[0].runs:
        if r._r.rPr is not None:
            cell_rpr = copy.deepcopy(r._r.rPr)
            break

    body_style = doc.paragraphs[38]           # ordinary body paragraph
    img_style = doc.paragraphs[62]            # paragraph that holds a picture
    cap_style = doc.paragraphs[63]            # figure caption
    tnum_style = doc.paragraphs[83]           # «Таблиця 1»
    tname_style = doc.paragraphs[84]          # table title

    T = TEXTS

    # ---- 1. abstract (R1-2) ------------------------------------------------
    set_text(para_by_prefix(doc, "Анотація."), T["abstract"])
    set_text(para_by_prefix(doc, "Abstract."), T["abstract_en"])

    # ---- 2. critical literature review (R1-3) ------------------------------
    a = para_by_prefix(doc, "Отже, на перетині трьох напрямів")
    set_text(a, T["review_1"])
    p = new_para(doc, a, T["review_2"], style_from=body_style)
    # national ranking mechanism launched while the manuscript was under review
    p = new_para(doc, p, T["review_nsd"], style_from=body_style)
    p = new_para(doc, p, T["review_3"], style_from=body_style)
    cap = caption_block(doc, p, "Таблиця 1", T["t1_title"], tnum_style, tname_style)
    tbl = new_table(doc, cap, T["t1_rows"], tbl_template, cell_rpr)
    new_para_after_el(tbl._tbl, T["review_4"], body_style, a._parent)

    # ---- 3. aim and objectives (R1-4) --------------------------------------
    aim = para_by_prefix(doc, "Мета статті")
    set_text(aim, T["aim"])
    new_para(doc, aim, T["aim_scope"], style_from=body_style)
    tasks = [para_by_prefix(doc, "обґрунтувати концептуальну модель"),
             para_by_prefix(doc, "спроєктувати архітектуру системи"),
             para_by_prefix(doc, "формалізувати конвеєр"),
             para_by_prefix(doc, "визначити роль людини"),
             para_by_prefix(doc, "розробити відтворюваний синтетичний бенчмарк"),
             para_by_prefix(doc, "експериментально оцінити ефективність"),
             para_by_prefix(doc, "на основі прозорої аналітичної моделі")]
    for par, txt in zip(tasks, T["tasks"]):
        set_text(par, txt)
    for par in tasks[len(T["tasks"]):]:
        par._p.getparent().remove(par._p)

    # ---- 4. concept map figure + glossary (R1-6) ---------------------------
    # the concept map goes in front of the TRACE figure block
    tr_img_par = None
    for i, p_ in enumerate(doc.paragraphs):
        if p_.text.strip().startswith("Рис. 2. Чотиришарова"):
            tr_img_par = doc.paragraphs[i - 1]
            break
    if tr_img_par is None:
        raise LookupError("TRACE figure caption not found")
    intro = new_para(doc, tr_img_par, T["concept_intro"], before=True, style_from=body_style)
    new_figure(doc, intro, f"{FIGDIR}/concept_map.png", T["fig1_caption"], 15.5, img_style, cap_style)

    meth = para_by_prefix(doc, "3. МЕТОДИКА")
    g2 = new_para(doc, meth, T["glossary_intro"], before=True, style_from=body_style)
    gcap = caption_block(doc, g2, "Таблиця 2", T["t2_title"], tnum_style, tname_style)
    new_table(doc, gcap, T["t2_rows"], tbl_template, cell_rpr)

    # ---- 5. tenant isolation (R2-5) + component status (R1-8) --------------
    arch = para_by_prefix(doc, "Рис. 3. Структурна схема")
    p = new_para(doc, arch, T["isolation_1"], style_from=body_style)
    p = new_para(doc, p, T["isolation_2"], style_from=body_style)
    p = new_para(doc, p, T["status_intro"], style_from=body_style)
    scap = caption_block(doc, p, "Таблиця 3", T["t3_title"], tnum_style, tname_style)
    new_table(doc, scap, T["t3_rows"], tbl_template, cell_rpr)

    # ---- 6. weights provenance (R2-2) + thresholds (R2-3) ------------------
    step4 = para_by_prefix(doc, "Крок 4. Кластеризація")
    new_paras(doc, step4, [T["weights"], T["thresholds"]], before=True, style_from=body_style)

    # ---- 7. ER pipeline figure (R2-6) + threshold figure (R2-3) -----------
    step5 = para_by_prefix(doc, "Крок 5. Злиття атрибутів")
    cap4 = new_figure(doc, step5, f"{FIGDIR}/er_pipeline.png", T["fig4_caption"], 13.5, img_style, cap_style)
    new_figure(doc, cap4, f"{FIGDIR}/f4_threshold_sensitivity.png", T["fig5_caption"], 15.5, img_style, cap_style)

    # ---- 8. manual-effort caveat (R2-1) -----------------------------------
    design = para_by_prefix(doc, "Якість оцінюється трьома групами метрик")
    new_para(doc, design, T["manual_meth"], style_from=body_style)
    appendix_model = para_by_prefix(doc, "Час рушія охоплює лише обчислення")
    new_para(doc, appendix_model, T["manual_caveat"], style_from=body_style)

    # ---- 9. validity threats (R1-8) ---------------------------------------
    limits = para_by_prefix(doc, "Межі емпіричного оцінювання")
    set_text(limits, T["limits_1"])
    new_para(doc, limits, T["limits_2"], style_from=body_style)

    # ---- 10. conclusions (R1-7) -------------------------------------------
    res = para_by_prefix(doc, "Отримано такі основні результати")
    set_text(res, T["concl"][0])
    cur = res
    for t in T["concl"][1:]:
        cur = new_para(doc, cur, t, style_from=body_style)
    doc_p3 = para_by_prefix(doc, "По-третє, побудовано відтворюваний")
    doc_p3._p.getparent().remove(doc_p3._p)

    # ---- 11. reproducibility versions (R2-4) ------------------------------
    contrib = para_by_prefix(doc, "Теоретичний внесок")
    new_para(doc, contrib, T["versions"], style_from=body_style)

    # ---- 12. prospects (R2-7) ---------------------------------------------
    persp = para_by_prefix(doc, "Перспективи подальших досліджень")
    set_text(persp, T["persp"][0])
    cur = persp
    for t in T["persp"][1:]:
        cur = new_para(doc, cur, t, style_from=body_style)

    # ---- 13. new references (R1-3) ----------------------------------------
    ref_anchors = [p_ for p_ in doc.paragraphs if p_.text.strip().startswith("[20]")]
    if not ref_anchors:
        print("WARNING: reference [20] not found; new references not inserted", file=sys.stderr)
    for anchor_ref in ref_anchors:          # Ukrainian list and English list
        cur = anchor_ref
        for t in T["refs"]:
            cur = new_para(doc, cur, t, style_from=anchor_ref)
    print(f"reference lists extended: {len(ref_anchors)}")

    # ---- 14. terminology unification (R1-6): anglicisms in the original text ----
    from docx.text.run import Run
    repl = {
        "ізолює tenant-дані": "розмежовує дані закладів (орендарів)",
        "tenant-сховище": "сховище з розмежуванням за закладами",
    }
    fixed = 0
    for par in doc.paragraphs:
        for a, b in repl.items():
            while replace_across_runs(par, a, b):
                fixed += 1
    print(f"terminology replacements: {fixed}")

    # ---- 15. proof-reading (R1-5): hyphen used as a dash after the DOCX conversion ----
    dashes = 0
    variants = [" - ", "\u00a0- ", " -\u00a0", "\u00a0-\u00a0"]   # incl. non-breaking spaces
    for par in doc.paragraphs:
        for v in variants:
            repl = v.replace("-", "\u2014")
            while replace_across_runs(par, v, repl, colour=None):
                dashes += 1
    print(f"hyphen -> em dash: {dashes}")

    doc.save(DST)
    print(f"written {DST}")


TEXTS = {}  # filled by texts.py
if __name__ == "__main__":
    from revision_texts import TEXTS as _T
    TEXTS.update(_T)
    main()
