"""매뉴얼 원문 글자를 지면에 보이는 순서 그대로 다시 뽑습니다.

지금까지는 pypdf로 글자를 뽑았습니다. pypdf는 PDF 안에 글자가 저장된 순서대로
읽어 내는데, 이 매뉴얼은 상자(소제목표·법령상자·표)를 종류별로 몰아서
저장해 두었습니다. 그래서 뽑아 낸 글자가 지면 순서와 전혀 달랐습니다.

  실제 지면 (25쪽)          pypdf가 뽑아 낸 순서
  ─────────────────         ─────────────────
  업무 흐름도               법령상자 2개
  세부내용 신원조사         소제목표 2개
    법령상자                흐름도
    표                      표 2개
  세부내용 결격사유 조회
    법령상자
    표

이 순서로는 어떤 내용이 어느 소제목에 속하는지 알 수 없습니다. 실제로
신원조사·결격사유 조회의 표 두 개가 엉뚱한 소제목 아래로 들어가 있었습니다.

pdfplumber로 글자의 좌표를 읽어 위에서 아래로 다시 세우면 지면과 같아집니다.
쪽 옆에 세로로 붙은 편 이름표(행/정/업/무…)는 본문이 아니므로 뺍니다.

사용법: python3 scripts/reextract_source_pages.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_source_tables import tables_of

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"

# 쪽 오른쪽에 세로로 붙은 편 이름표가 있는 자리입니다. 본문은 여기까지 오지 않습니다.
CONTENT_RIGHT_EDGE = 556

SOURCES = {
    1: ROOT / "source" / "chapter-01" / "original" / "제1편행정업무및보안.pdf",
    3: ROOT / "source" / "chapter-03" / "original" / "제3편인사관리.pdf",
}


def load(chapter: int) -> dict:
    path = ASSETS / f"chapter{chapter}-data.js"
    prefix = f"window.CHAPTER{chapter}_DATA = "
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw.removeprefix(prefix).removesuffix(";\n"))


def save(chapter: int, data: dict) -> None:
    path = ASSETS / f"chapter{chapter}-data.js"
    path.write_text(
        f"window.CHAPTER{chapter}_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def page_text(page) -> str:
    body = page.filter(
        lambda obj: obj.get("object_type") != "char" or obj.get("x1", 0) <= CONTENT_RIGHT_EDGE
    )
    text = body.extract_text(x_tolerance=1.6, y_tolerance=3) or ""
    # 제3편은 낱말 사이를 보통 띄어쓰기가 아닌 특수 글자로 벌려 놓았습니다.
    # 그대로 두면 화면과 검색에서 '지방공무원임용령'처럼 붙어 보입니다.
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\xa0]", " ", text)
    lines = []
    for raw in text.split("\n"):
        line = re.sub(r"[^\S\n]+", " ", raw).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def main() -> None:
    for chapter, pdf_path in SOURCES.items():
        data = load(chapter)
        changed = 0
        with pdfplumber.open(pdf_path) as document:
            for section in data["sections"]:
                for page in section["sourcePages"]:
                    source = document.pages[int(page["pdfPage"]) - 1]
                    fresh = page_text(source)
                    if fresh != page["text"]:
                        changed += 1
                    page["text"] = fresh
                    # 표는 글자만으로는 어느 칸에 속하는지 알 수 없으므로
                    # 경계선을 읽어 칸 단위로 따로 담아 둡니다.
                    page["tables"] = tables_of(source)
        save(chapter, data)
        pages = sum(len(s["sourcePages"]) for s in data["sections"])
        print(f"제{chapter}편: 원문 {pages}쪽 중 {changed}쪽을 지면 순서로 다시 세웠습니다.")


if __name__ == "__main__":
    main()
