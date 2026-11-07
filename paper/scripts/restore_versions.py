import sys
sys.path.insert(0, 'paper/scripts')
from docx import Document
from apply_revision import new_para
from revision_texts import TEXTS

DOC = "paper/ITLT_TRACE_ITZN_revision1.docx"
doc = Document(DOC)

anchor = None
for p in doc.paragraphs:
    if "ліцензією MIT" in p.text and "github.com/SZabolotnii" in p.text:
        anchor = p
if anchor is None:
    sys.exit("anchor paragraph (MIT licence) not found")

if any("Відтворюваність. Коректний запуск" in p.text for p in doc.paragraphs):
    sys.exit("the reproducibility paragraph is already there")

new_para(doc, anchor, TEXTS["versions"])
doc.save(DOC)
print("restored after:", anchor.text[-60:])
