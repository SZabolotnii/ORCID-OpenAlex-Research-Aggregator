#!/usr/bin/env python3
"""Accept the tracked insertions left in the built revision DOCX.

The editorial office asked for colour-marked additions, not Word's track-changes
mode; the file still carried 28 insertions a co-author made on 2026-06-26 (the
reference numbers), inherited from the original submission. Accepting an
insertion means keeping its content and dropping the <w:ins> wrapper.

Run: python3 paper/scripts/accept_revisions.py
"""
from docx import Document

DOC = "paper/ITLT_TRACE_ITZN_revision1.docx"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def main():
    doc = Document(DOC)
    body = doc.element.body
    ins = body.findall(".//" + W + "ins")
    for el in ins:
        parent = el.getparent()
        idx = list(parent).index(el)
        for child in reversed(list(el)):
            parent.insert(idx, child)
        # a <w:ins> can carry tail text in theory; python-docx documents do not
        parent.remove(el)
    doc.save(DOC)
    print(f"accepted insertions: {len(ins)}")
    left = len(Document(DOC).element.body.findall(".//" + W + "ins"))
    print(f"remaining: {left}")


if __name__ == "__main__":
    main()
