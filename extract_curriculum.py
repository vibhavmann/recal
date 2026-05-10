"""
extract_curriculum.py
Reads chapter-by-chapter NCERT PDFs from data/books/ and extracts section headings
as subtopics. Updates data/curricula/*.json files in place.

Expected folder layout (each chapter is a separate PDF):
  data/books/
    Class_05/
      Mathematics - Math-Mela/
        Chapter_01.pdf  Chapter_02.pdf  ...
      The World Around Us - Our Wonderous World/
        Chapter_01.pdf  ...
    Class_06/
      Mathematics - Ganita Prakash/
        Chapter_01.pdf  ...

Usage:
    pip install pymupdf
    python extract_curriculum.py
"""

import json
import re
import sys
from pathlib import Path
from collections import Counter

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF not found. Run:  pip install pymupdf")

ROOT = Path(__file__).parent

# Map: book folder (relative) -> curriculum JSON file
BOOKS = [
    {
        "folder": ROOT / "data/books/Class_05/Mathematics - Math-Mela",
        "json":   ROOT / "data/curricula/class5-maths-mela.json",
    },
    {
        "folder": ROOT / "data/books/Class_05/The World Around Us - Our Wonderous World",
        "json":   ROOT / "data/curricula/class5-evs-our-wondrous-world.json",
    },
    {
        "folder": ROOT / "data/books/Class_06/Mathematics - Ganita Prakash",
        "json":   ROOT / "data/curricula/class6-ganita-prakash.json",
    },
]

# ── Text helpers ───────────────────────────────────────────────────────────────

_NOISE_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", _NOISE_RE.sub("", text)).strip()

def is_valid_heading(text: str) -> bool:
    if not text or len(text) < 4 or len(text) > 120:
        return False
    # Punctuation / number-only runs (page numbers, dividers)
    if re.match(r"^[\d\s\.,:;!\-–—/\\]+$", text):
        return False
    # Questions — these are exercise items, not section titles
    if text.endswith("?"):
        return False
    # Exercise labels: "Q.", "Q1.", "Q.1", "Ans.", "a.", "b." at start of line
    if re.match(r"^(Q\.?\s*\d*|Ans\.?|[a-e]\.\s+\S)", text):
        return False
    # Bullet / dash content mid-sentence
    if text.startswith(("•", "–", "—", "- ", "* ")):
        return False
    # Step labels like "Step 1:", "Step 2:"
    if re.match(r"^Step\s+\d+[:\.]", text):
        return False
    # Single-word all-caps abbreviations
    if text.isupper() and len(text.split()) <= 2:
        return False
    # Must have at least 2 words (filters out single-word labels like "denominator")
    if len(text.split()) < 2:
        return False
    return True

# ── Font-size analysis ─────────────────────────────────────────────────────────

def body_font_size(doc: fitz.Document) -> float:
    """
    Estimate body text font size by weighting each size by its total character
    count (not span count). This prevents tiny math symbols and superscripts
    from skewing the result in heavily illustrated / math-heavy PDFs.
    Only considers sizes in the plausible body-text range (8–20pt).
    """
    char_counts: dict[float, int] = {}
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    t = span["text"].strip()
                    if not t:
                        continue
                    s = round(span["size"], 1)
                    if 8.0 <= s <= 20.0:
                        char_counts[s] = char_counts.get(s, 0) + len(t)
    if not char_counts:
        return 10.0
    return max(char_counts, key=lambda s: char_counts[s])

# ── Heading extraction from a single chapter PDF ───────────────────────────────

def extract_headings_from_pdf(pdf_path: Path, chapter_name: str) -> list[str]:
    """
    Open a single-chapter PDF and return section headings as a list of strings.

    Strategy: evaluate each full line, not individual spans.
    A line qualifies as a heading when its leading span's font is:
      - at least body_size + 3 pt larger (large standalone heading), OR
      - bold AND at least body_size + 1 pt larger (bold sub-heading)
    This avoids capturing inline bold terms (e.g. "numerator", "Figure it Out")
    that appear mid-sentence at body size.
    """
    doc = fitz.open(str(pdf_path))
    bsize = body_font_size(doc)

    headings: list[str] = []
    seen: set[str] = set()
    chapter_lower = chapter_name.lower()

    for pg_idx, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                if not line["spans"]:
                    continue

                # Use the first span to decide whether this line is a heading
                first = line["spans"][0]
                size  = first["size"]
                is_bold = bool(first.get("flags", 0) & 16) or "Bold" in first.get("font", "")

                large_heading = size >= bsize + 3
                bold_heading  = is_bold and size >= bsize + 1 and pg_idx > 0

                if not (large_heading or bold_heading):
                    continue

                # Collect full line text from all spans
                text = clean(" ".join(s["text"] for s in line["spans"]))
                if not is_valid_heading(text):
                    continue

                # Normalise ALL-CAPS headings to Title Case
                if text == text.upper() and len(text.split()) > 1:
                    text = text.title()

                key = text.lower()
                if chapter_lower in key or key in chapter_lower:
                    continue
                if key not in seen:
                    seen.add(key)
                    headings.append(text)

    doc.close()
    return headings

# ── Per-book processing ────────────────────────────────────────────────────────

def process_book(folder: Path, json_path: Path) -> None:
    print(f"\n{'-'*60}")
    print(f"Book : {folder.name}")

    if not folder.exists():
        print(f"  [SKIP] Folder not found: {folder}")
        return
    if not json_path.exists():
        print(f"  [SKIP] JSON not found: {json_path}")
        return

    curriculum = json.loads(json_path.read_text(encoding="utf-8"))
    chapters   = curriculum["chapters"]

    filled = 0
    for ch in chapters:
        chno = ch["no"]
        pdf_path = folder / f"Chapter_{chno:02d}.pdf"

        if not pdf_path.exists():
            print(f"  Ch {chno:2d} [{ch['name'][:42]}]  -> PDF not found ({pdf_path.name})")
            continue

        headings = extract_headings_from_pdf(pdf_path, ch["name"])

        if headings:
            ch["subtopics"] = headings
            filled += 1
            print(f"  Ch {chno:2d} [{ch['name'][:42]}]  -> {len(headings)} subtopics")
        else:
            print(f"  Ch {chno:2d} [{ch['name'][:42]}]  -> no headings detected (check manually)")

    curriculum["_meta"]["subtopics_extracted"] = True
    curriculum["_meta"]["subtopics_verified"]  = False

    json_path.write_text(
        json.dumps(curriculum, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    print(f"\n  OK Saved {json_path.name}  ({filled}/{len(chapters)} chapters populated)")

# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    print("NCERT Curriculum Extractor")
    print("=" * 60)
    for book in BOOKS:
        process_book(book["folder"], book["json"])
    print(f"\n{'='*60}")
    print("Done.")
    print("Review the JSON files. Set subtopics_verified: true for")
    print("any chapters you've manually checked.")

if __name__ == "__main__":
    main()
