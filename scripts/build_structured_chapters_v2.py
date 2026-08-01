from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
FLOW_TITLE = "업무 흐름도"
LAW_TITLE = "관련법규 및 참고자료"
SOURCE_FLOW = re.compile(r"^\s*[^▶\n]+\s*▶")
# 법령 상자 안에 들어가는 줄입니다. 「」로 묶인 법령 이름으로 시작합니다.
LAW_LINE = re.compile(r"^(?:[•‣▶]\s*)?[「『].+[」』]")
ORNAMENTS = {
    "제",
    "1편",
    "3편",
    "행정업무 및 보안",
    "인사관리",
    "제1편 행정업무 및 보안",
    "제3편 인사관리",
    "학교 행정업무 길라잡이",
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


def is_heading(line: str) -> bool:
    if line in {FLOW_TITLE, "관련법규 및 참고자료", "TIP"}:
        return True
    # 매뉴얼은 소제목 앞에 '세부내용'이라는 알약 모양 표시를 붙여 둡니다.
    if re.match(r"^세부내용\s+\S", line):
        return True
    # 매뉴얼에는 '7 . 전보'처럼 번호와 마침표 사이가 벌어진 소제목도 있습니다.
    # 공백을 허용하지 않으면 앞 소제목 본문에 묻혀 목차에서 사라집니다.
    # 다만 '1.8cm의 정사각형' 같은 치수는 소제목이 아니므로
    # 마침표 뒤에 숫자가 오는 것은 뺍니다.
    if re.match(r"^\d+\s*\.\s*(?!\d)\S", line):
        return True
    if re.match(r"^\d+\s+[가-힣A-Za-z]", line) and len(line) <= 45:
        return True
    return False


def is_law_line(line: str) -> bool:
    return bool(LAW_LINE.match(line))


def filtered_lines(text: str, printed_page: int) -> list[str]:
    return [
        line
        for raw in text.splitlines()
        if (line := raw.strip())
        and line not in ORNAMENTS
        and line != str(printed_page)
    ]


def split_page(page: dict) -> tuple[list[dict], list[str]]:
    lines = filtered_lines(str(page["text"]), int(page["printedPage"]))
    blocks: list[dict] = []
    title = f"매뉴얼 {page['printedPage']}쪽"
    title_from_source = False
    body: list[str] = []

    def flush() -> None:
        nonlocal body
        if not body and title.startswith("매뉴얼 "):
            return
        blocks.append(
            {
                "id": f"p{page['pdfPage']}-b{len(blocks) + 1}",
                "title": title,
                "body": "\n".join(body).strip(),
                "pdfPage": page["pdfPage"],
                "printedPage": page["printedPage"],
                "sourceLineCount": len(body) + (1 if title_from_source else 0),
            }
        )
        body = []

    for line in lines:
        exact_flow = bool(SOURCE_FLOW.match(line))
        if is_heading(line) or exact_flow:
            flush()
            title = FLOW_TITLE if exact_flow else line
            title_from_source = not exact_flow
            body = [line] if exact_flow else []
            continue

        # 법령 상자는 지면에서 법령 줄까지가 끝이고 그 아래 표는 별개입니다.
        # 상자를 닫아 주지 않으면 표가 '관련법규 및 참고자료' 안으로 딸려 들어갑니다.
        if title == LAW_TITLE and not is_law_line(line):
            flush()
            title = f"매뉴얼 {page['printedPage']}쪽"
            title_from_source = False

        body.append(line)
    flush()
    return blocks, lines


def attach_tables(page: dict, blocks: list[dict]) -> int:
    """경계선에서 읽어 낸 표를 그 표가 실린 블록에 붙입니다.

    본문 글자는 그대로 두고 표 정보만 얹습니다. 검색은 본문 글자를 쓰고,
    화면은 표 정보가 있으면 칸을 그대로 그립니다.
    """
    pending = list(page.get("tables") or [])
    attached = 0
    for block in blocks:
        if not pending:
            break
        lines = [re.sub(r"\s+", " ", line).strip() for line in str(block["body"]).splitlines()]
        head = re.sub(r"\s+", " ", " ".join(pending[0]["headers"])).strip()
        if head and head in lines:
            block["table"] = pending.pop(0)
            attached += 1
    return attached


def build(chapter: int) -> None:
    data = load(chapter)
    total_source_lines = 0
    total_block_lines = 0
    exact_flows = 0
    tables = 0

    for section in data["sections"]:
        content_blocks = []
        flow_groups = []
        for page in section["sourcePages"]:
            blocks, lines = split_page(page)
            attach_tables(page, blocks)
            content_blocks.extend(blocks)
            total_source_lines += len(lines)
            total_block_lines += sum(block["sourceLineCount"] for block in blocks)
        for block in content_blocks:
            if block["title"] == FLOW_TITLE and SOURCE_FLOW.match(block["body"]):
                flow_groups.append(
                    {
                        "sourceText": block["body"],
                        "pdfPage": block["pdfPage"],
                        "printedPage": block["printedPage"],
                    }
                )
        section["contentBlocks"] = content_blocks
        section["flowGroups"] = flow_groups
        exact_flows += len(flow_groups)
        tables += sum(1 for block in content_blocks if block.get("table"))

    if total_source_lines != total_block_lines:
        raise RuntimeError(
            f"제{chapter}편 원문 줄 수 불일치: "
            f"{total_source_lines} != {total_block_lines}"
        )

    save(chapter, data)
    steps = {
        section["id"]: section["flowGroups"]
        for section in data["sections"]
    }
    (ASSETS / f"chapter{chapter}-steps.js").write_text(
        f"window.CHAPTER{chapter}_STEPS = "
        + json.dumps(steps, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"제{chapter}편: 원문 {total_source_lines}줄 → "
        f"구조화 블록 {sum(len(section['contentBlocks']) for section in data['sections'])}개, "
        f"원문 흐름 {exact_flows}개, 칸을 읽어 낸 표 {tables}개"
    )


def main() -> None:
    build(1)
    build(3)


if __name__ == "__main__":
    main()
