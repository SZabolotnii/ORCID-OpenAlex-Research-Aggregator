#!/usr/bin/env python3
"""Build file 2 of the round-2 resubmission: "reviewer comment -> done / not done" tables.

Writes paper/ITLT_6755_response_tables_r2.docx (texts: revision2_texts.py).
Run from the repository root:  PYTHONPATH=paper/scripts python3 paper/scripts/build_response_tables_r2.py
"""
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

import revision2_texts as T

DST = "paper/ITLT_6755_response_tables_r2.docx"


def add_table(doc, rows, title, widths, status_col=None):
    p = doc.add_paragraph()
    p.add_run(title).bold = True
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    t.autofit = False
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for gc, w in zip(t._tbl.find(W + "tblGrid").findall(W + "gridCol"), widths):
        gc.set(W + "w", str(int(w * 567)))
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            cell = t.cell(i, j)
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            run.font.size = Pt(10)
            if i == 0 or j == status_col:
                run.bold = True
            cell.width = Cm(widths[j])
    doc.add_paragraph()


def main():
    doc = Document()
    for s in doc.sections:
        s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Cm(2)
        s.page_width, s.page_height = Cm(29.7), Cm(21.0)     # landscape A4
        s.orientation = 1

    h = doc.add_paragraph()
    r = h.add_run("Відповіді на зауваження рецензентів (раунд 2)")
    r.bold = True
    r.font.size = Pt(14)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    meta = doc.add_paragraph()
    meta.add_run(
        "Стаття: «Генеративний штучний інтелект та автономні агенти в управлінні науковою "
        "діяльністю закладів вищої освіти». Подання ІТЗН № 6755. Раунд рецензування: 2.\n"
        "Автори: Заболотній С. В., Мулеса П. П., Хотунов В. І., Ткаченко О. М.\n\n" + T.RESPONSE_INTRO
    ).font.size = Pt(11)

    w5 = [0.8, 5.0, 3.0, 12.6, 4.2]
    add_table(doc, T.R1_ROWS, "Таблиця 1. Відповіді на зауваження Рецензента 1", w5, status_col=2)
    add_table(doc, T.R2_ROWS, "Таблиця 2. Відповіді на зауваження Рецензента 2", w5, status_col=2)
    add_table(doc, T.OTHER_ROWS, "Таблиця 3. Інші зміни, внесені з ініціативи авторів",
              [0.8, 10.0, 10.0, 4.8])
    doc.save(DST)
    print(f"written {DST}")


if __name__ == "__main__":
    main()
