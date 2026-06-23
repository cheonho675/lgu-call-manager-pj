from pathlib import Path

from pypdf import PdfReader


base = Path(r"C:\Users\GA\Desktop\lg-pj\_lgu_spec")
out = Path(r"C:\Users\GA\Desktop\lg-pj\_lgu_spec_text")
out.mkdir(exist_ok=True)

for pdf in base.rglob("*.pdf"):
    reader = PdfReader(str(pdf))
    text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
    name = "__".join(pdf.relative_to(base).with_suffix("").parts) + ".txt"
    (out / name).write_text(text, encoding="utf-8")
    print(f"{name}\t{len(reader.pages)} pages\t{len(text)} chars")
