#!/usr/bin/env python3
"""Normalize the ITLT submission DOCX after Pandoc conversion.

Pandoc keeps the manuscript content, tables, and figures, but its DOCX style
mapping is not strict enough for the ITLT template. This post-processor applies
the journal-facing Word layout rules deterministically.
"""

from __future__ import annotations

import argparse
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.text.paragraph import Paragraph
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt


MAJOR_HEADINGS = {
    "ВСТУП",
    "ТЕОРЕТИЧНІ ОСНОВИ ТА МЕТОДИ ДОСЛІДЖЕННЯ",
    "РЕЗУЛЬТАТИ ДОСЛІДЖЕННЯ",
    "ВИСНОВКИ ТА ПЕРСПЕКТИВИ ПОДАЛЬШИХ ДОСЛІДЖЕНЬ",
    "DECLARATION OF GENERATIVE AI AND AI-ASSISTED TECHNOLOGIES IN THE WRITING PROCESS",
    "CONFLICT OF INTEREST",
    "REFERENCES (TRANSLATED AND TRANSLITERATED)",
}

SUBHEAD_PREFIXES = (
    "Постановка проблеми",
    "Аналіз останніх досліджень",
    "Мета і завдання статті",
    "Реактивна та проактивна",
    "Інженерна рамка TRACE",
    "Функціональна архітектура ResearchIQ",
    "Золотий запис",
    "Дизайн оцінювання",
    "Загрози валідності",
    "А.1.",
    "А.2.",
    "А.3.",
    "А.4.",
)

TABLE_TEXT_WIDTH_DXA = 9000
FEATURE_TABLE_ROWS = [
    ("Ознака φ", "Вага β"),
    ("Збіг DOI (doi_match)", "+3,0"),
    ("Конфлікт DOI (doi_conflict)", "-5,0"),
    ("Косинусна близькість назв, TF (title_cosine)", "+1,2"),
    ("Символьна подібність, Левенштейн (char_sim)", "+0,8"),
    ("Узгодженість року, |Δрік|≤1 (year_agree)", "+0,6"),
    ("Жаккар за журналом (venue_jaccard)", "+0,4"),
    ("Жаккар за авторами (author_jaccard)", "+0,9"),
    ("Збіг URL (url_match)", "+0,2"),
]
DEDUP_TABLE_ROWS = [
    ("Метод", "P", "R", "F1", "B³ F1"),
    ("DOI-only", "100,0 ± 0,0", "42,6 ± 0,5", "59,7 ± 0,5", "93,7 ± 0,1"),
    ("Title+Year", "83,3 ± 0,6", "39,4 ± 0,4", "53,5 ± 0,4", "92,7 ± 0,1"),
    ("Fuzzy (незважений)", "83,7 ± 0,6", "41,1 ± 0,4", "55,1 ± 0,4", "92,9 ± 0,1"),
    ("Golden Record", "88,2 ± 0,5", "68,1 ± 0,6", "76,8 ± 0,4", "95,8 ± 0,1"),
]
FIELD_TABLE_ROWS = [
    ("Показник поля", "Значення"),
    ("Наявність DOI (DOI present)", "45,4 ± 0,4"),
    ("Коректність DOI (DOI correct)", "67,8 ± 0,2"),
    ("Точність року (Year accuracy)", "80,9 ± 0,2"),
    ("Точність назви (Title accuracy)", "99,95 ± 0,01"),
]
EFFICIENCY_TABLE_ROWS = [
    ("Показник", "Значення"),
    ("Середня кількість записів на ЗВО", "≈ 7056"),
    ("Середня кількість рішень дедуплікації", "≈ 1441"),
    ("Час рушія (дедуплікація+злиття, весь ЗВО)", "2,11 ± 0,21 с"),
    ("Модель ручної праці (на ЗВО, рік)", "≈ 429,1 год"),
    ("Модель ручної праці (на кафедральний звіт)", "≈ 21,45 год"),
    ("Смуга HITL (на дослідника)", "≈ 56,5 пар"),
]


def sanitize_visible_text(text: str) -> str:
    """Remove invisible copy artifacts and simple spacing defects."""
    for char in ("\u200b", "\u200c", "\u200d", "\ufeff"):
        text = text.replace(char, "")
    return re.sub(r"\s+([.,;:!?])", r"\1", text)


def set_xml_attr(element, name: str, value: str) -> None:
    element.set(qn(f"w:{name}"), value)


def set_run_font(run, size_pt: int | float, *, bold: bool | None = None, italic: bool | None = None) -> None:
    run.font.name = "Times New Roman"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    run.font.size = Pt(size_pt)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_paragraph_font(paragraph, size_pt: int | float, *, bold: bool | None = None, italic: bool | None = None) -> None:
    if not paragraph.runs:
        paragraph.add_run("")
    for run in paragraph.runs:
        set_run_font(run, size_pt, bold=bold, italic=italic)


def set_body_paragraph(paragraph) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.first_line_indent = Cm(1)
    pf.left_indent = None
    pf.right_indent = None
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, 12)


def set_no_indent(paragraph, *, size_pt: int | float = 12, align=None, bold=False, italic=False) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = align
    pf.first_line_indent = Cm(0)
    pf.left_indent = None
    pf.right_indent = None
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, size_pt, bold=bold, italic=italic)


def set_major_heading(paragraph) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.first_line_indent = Cm(0)
    pf.left_indent = None
    pf.right_indent = None
    pf.space_before = Pt(24)
    pf.space_after = Pt(12)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, 12, bold=True)


def set_subheading(paragraph) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.first_line_indent = Cm(0)
    pf.left_indent = None
    pf.right_indent = None
    pf.space_before = Pt(12)
    pf.space_after = Pt(6)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, 12, bold=True)


def set_abstract(paragraph) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.first_line_indent = Cm(0)
    pf.left_indent = Cm(1)
    pf.right_indent = Cm(1)
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, 10)


def set_reference(paragraph) -> None:
    pf = paragraph.paragraph_format
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.left_indent = Cm(0.7)
    pf.first_line_indent = Cm(-0.7)
    pf.right_indent = None
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1
    set_paragraph_font(paragraph, 10)


def table_column_widths(table) -> list[int]:
    cols = len(table.columns)
    if cols == 2:
        first_header = table.rows[0].cells[0].text.strip()
        if first_header.startswith("Ознака"):
            return [6800, 2200]
        return [5200, 3800]
    if cols == 5:
        return [2200, 1700, 1700, 1700, 1700]
    base = TABLE_TEXT_WIDTH_DXA // max(cols, 1)
    widths = [base] * cols
    widths[-1] += TABLE_TEXT_WIDTH_DXA - sum(widths)
    return widths


def rewrite_table_rows(table, rows: list[tuple[str, ...]]) -> None:
    for row, values in zip(table.rows, rows):
        for cell, value in zip(row.cells, values):
            cell.text = value


def maybe_rewrite_known_table(table) -> None:
    if len(table.columns) == 2 and len(table.rows) == len(FEATURE_TABLE_ROWS):
        if table.rows[0].cells[0].text.strip().startswith("Ознака"):
            rewrite_table_rows(table, FEATURE_TABLE_ROWS)
            return
    if len(table.columns) == 5 and len(table.rows) == len(DEDUP_TABLE_ROWS):
        if table.rows[0].cells[0].text.strip().startswith("Метод"):
            rewrite_table_rows(table, DEDUP_TABLE_ROWS)
            return
    if len(table.columns) == 2 and len(table.rows) == len(FIELD_TABLE_ROWS):
        if table.rows[0].cells[0].text.strip().startswith("Показник поля"):
            rewrite_table_rows(table, FIELD_TABLE_ROWS)
            return
    if len(table.columns) == 2 and len(table.rows) == len(EFFICIENCY_TABLE_ROWS):
        if table.rows[0].cells[0].text.strip().startswith("Показник"):
            rewrite_table_rows(table, EFFICIENCY_TABLE_ROWS)
        return


def set_table_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    if tbl_pr is None:
        tbl_pr = OxmlElement("w:tblPr")
        table._tbl.insert(0, tbl_pr)
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = qn(f"w:{edge}")
        node = borders.find(tag)
        if node is None:
            node = OxmlElement(f"w:{edge}")
            borders.append(node)
        set_xml_attr(node, "val", "single")
        set_xml_attr(node, "sz", "4")
        set_xml_attr(node, "space", "0")
        set_xml_attr(node, "color", "000000")


def set_table_geometry(table, widths: list[int]) -> None:
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_pr = table._tbl.tblPr
    if tbl_pr is None:
        tbl_pr = OxmlElement("w:tblPr")
        table._tbl.insert(0, tbl_pr)
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    set_xml_attr(tbl_w, "type", "dxa")
    set_xml_attr(tbl_w, "w", str(sum(widths)))

    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    set_xml_attr(layout, "type", "fixed")

    tbl_grid = table._tbl.find(qn("w:tblGrid"))
    if tbl_grid is None:
        tbl_grid = OxmlElement("w:tblGrid")
        table._tbl.insert(1, tbl_grid)
    for child in list(tbl_grid):
        tbl_grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        set_xml_attr(col, "w", str(width))
        tbl_grid.append(col)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            width = widths[min(idx, len(widths) - 1)]
            cell.width = Cm(width / 567)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            set_xml_attr(tc_w, "type", "dxa")
            set_xml_attr(tc_w, "w", str(width))


def set_table_text(table) -> None:
    maybe_rewrite_known_table(table)
    widths = table_column_widths(table)
    set_table_geometry(table, widths)
    set_table_borders(table)
    for row_idx, row in enumerate(table.rows):
        for col_idx, cell in enumerate(row.cells):
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            for paragraph in cell.paragraphs:
                if row_idx == 0 or col_idx > 0:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                paragraph.paragraph_format.first_line_indent = Cm(0)
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1
                bold = row_idx == 0 or row.cells[0].text.strip() == "Golden Record"
                set_paragraph_font(paragraph, 10, bold=bold)


def insert_paragraph_after(paragraph, text: str):
    new_p = OxmlElement("w:p")
    paragraph._p.addnext(new_p)
    new_para = Paragraph(new_p, paragraph._parent)
    new_para.add_run(text)
    return new_para


def normalize_docx(input_path: Path, output_path: Path) -> None:
    doc = Document(input_path)

    # Page setup: A4, 2.5 cm margins, no different first/even sections.
    for section in doc.sections:
        section.start_type = WD_SECTION_START.NEW_PAGE
        section.page_width = Cm(21)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)
        section.header_distance = Cm(1.25)
        section.footer_distance = Cm(1.25)
        section.different_first_page_header_footer = False
        for container in (section.header, section.footer, section.first_page_header, section.first_page_footer):
            for paragraph in container.paragraphs:
                paragraph.clear()

    # Global style defaults.
    for style_name in ("Normal", "Body Text", "First Paragraph", "Bibliography"):
        if style_name in doc.styles:
            style = doc.styles[style_name]
            style.font.name = "Times New Roman"
            style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
            style.font.size = Pt(12)
            pf = style.paragraph_format
            pf.space_before = Pt(0)
            pf.space_after = Pt(0)
            pf.line_spacing = 1

    paragraphs = doc.paragraphs
    if not paragraphs:
        raise RuntimeError("No paragraphs found in DOCX")

    # Rebuild front matter lost/merged by Pandoc's LaTeX reader.
    paragraphs[0].clear()
    paragraphs[0].add_run("УДК 37:004:378:001.89")
    set_no_indent(paragraphs[0], size_pt=10, align=WD_ALIGN_PARAGRAPH.LEFT)

    p = insert_paragraph_after(paragraphs[0], "Заболотній Сергій Васильович")
    set_no_indent(p, size_pt=10, align=WD_ALIGN_PARAGRAPH.LEFT, bold=True)
    p = insert_paragraph_after(p, "Черкаський державний бізнес-коледж, м. Черкаси, Україна")
    set_no_indent(p, size_pt=10, align=WD_ALIGN_PARAGRAPH.LEFT)
    p = insert_paragraph_after(p, "ORCID ID: 0000-0003-0242-2234")
    set_no_indent(p, size_pt=10, align=WD_ALIGN_PARAGRAPH.LEFT)
    p = insert_paragraph_after(p, "zabolotnii.serhii@csbc.edu.ua")
    set_no_indent(p, size_pt=10, align=WD_ALIGN_PARAGRAPH.LEFT, italic=True)

    # Re-read after insertions.
    paragraphs = doc.paragraphs

    # Replace the stray thebibliography width argument with the required heading.
    for paragraph in paragraphs:
        if paragraph.text.strip() == "99":
            paragraph.clear()
            paragraph.add_run("REFERENCES (TRANSLATED AND TRANSLITERATED)")
            break

    # Prefix references while preserving any runs/hyperlinks already produced by Pandoc.
    ref_started = False
    ref_no = 1
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if text == "REFERENCES (TRANSLATED AND TRANSLITERATED)":
            ref_started = True
            continue
        if ref_started:
            # The reference list ends where the appendix or the editorial line
            # begins; stop numbering there so appendix paragraphs are not prefixed.
            if text.startswith("Text of the article was accepted") or text.startswith("ДОДАТОК"):
                break
            if text and not text.startswith("["):
                prefix = OxmlElement("w:r")
                t = OxmlElement("w:t")
                t.text = f"[{ref_no}] "
                prefix.append(t)
                paragraph._p.insert(0, prefix)
                ref_no += 1

    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        if text in MAJOR_HEADINGS:
            set_major_heading(paragraph)
        elif text.startswith("ДОДАТОК"):
            set_major_heading(paragraph)
        elif text.startswith(SUBHEAD_PREFIXES):
            set_subheading(paragraph)
        elif text.startswith(("Анотація.", "Ключові слова:", "Abstract.", "Keywords:")):
            set_abstract(paragraph)
        elif text.startswith("ГЕНЕРАТИВНИЙ ШТУЧНИЙ ІНТЕЛЕКТ"):
            set_no_indent(paragraph, size_pt=12, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True)
        elif text.startswith(("УДК ", "Заболотній Сергій", "Черкаський державний", "ORCID ID:", "zabolotnii.")):
            set_no_indent(
                paragraph,
                size_pt=10,
                align=WD_ALIGN_PARAGRAPH.LEFT,
                bold=text.startswith("Заболотній Сергій"),
                italic=text.startswith("zabolotnii."),
            )
        elif text.startswith("Text of the article was accepted"):
            set_no_indent(paragraph, size_pt=10, align=WD_ALIGN_PARAGRAPH.RIGHT)
        elif ref_started and text.startswith("["):
            set_reference(paragraph)
        else:
            set_body_paragraph(paragraph)

    for table in doc.tables:
        set_table_text(table)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)
    strip_headers_footers_and_page_numbers(output_path)


def strip_headers_footers_and_page_numbers(path: Path) -> None:
    ns = {
        "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
        "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        with zipfile.ZipFile(path) as zin:
            zin.extractall(tmp)

        document_xml = tmp / "word" / "document.xml"
        ET.register_namespace("w", ns["w"])
        ET.register_namespace("r", ns["r"])
        tree = ET.parse(document_xml)
        root = tree.getroot()
        for text_node in root.findall(".//w:t", ns):
            if text_node.text:
                text_node.text = sanitize_visible_text(text_node.text)
        for sect in root.findall(".//w:sectPr", ns):
            for child in list(sect):
                tag = child.tag.split("}", 1)[-1]
                if tag in {"headerReference", "footerReference", "pgNumType"}:
                    sect.remove(child)
            pg_sz = sect.find("w:pgSz", ns)
            if pg_sz is not None:
                pg_sz.set(qn("w:w"), "11906")
                pg_sz.set(qn("w:h"), "16838")
            pg_mar = sect.find("w:pgMar", ns)
            if pg_mar is not None:
                for key in ("top", "right", "bottom", "left"):
                    pg_mar.set(qn(f"w:{key}"), "1418")
                pg_mar.set(qn("w:gutter"), "0")
        tree.write(document_xml, encoding="UTF-8", xml_declaration=True)

        rels_xml = tmp / "word" / "_rels" / "document.xml.rels"
        if rels_xml.exists():
            ET.register_namespace("", ns["pr"])
            rels_tree = ET.parse(rels_xml)
            rels_root = rels_tree.getroot()
            for rel in list(rels_root):
                rel_type = rel.get("Type", "")
                target = rel.get("Target", "")
                if rel_type.endswith("/header") or rel_type.endswith("/footer") or target.startswith(("header", "footer")):
                    rels_root.remove(rel)
            rels_tree.write(rels_xml, encoding="UTF-8", xml_declaration=True)

        content_types_xml = tmp / "[Content_Types].xml"
        if content_types_xml.exists():
            ET.register_namespace("", ns["ct"])
            ct_tree = ET.parse(content_types_xml)
            ct_root = ct_tree.getroot()
            for child in list(ct_root):
                part_name = child.get("PartName", "")
                if part_name.startswith("/word/header") or part_name.startswith("/word/footer"):
                    ct_root.remove(child)
            ct_tree.write(content_types_xml, encoding="UTF-8", xml_declaration=True)

        for part in (tmp / "word").glob("header*.xml"):
            part.unlink()
        for part in (tmp / "word").glob("footer*.xml"):
            part.unlink()

        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zout:
            for file in tmp.rglob("*"):
                if file.is_file():
                    zout.write(file, file.relative_to(tmp).as_posix())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        tmp = args.output.with_suffix(".tmp.docx")
        normalize_docx(args.input, tmp)
        shutil.move(tmp, args.output)
    else:
        normalize_docx(args.input, args.output)


if __name__ == "__main__":
    main()
