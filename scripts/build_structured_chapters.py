from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"


FLOW_KEYWORDS = {
    1: {
        "official-documents": {
            "문서작성": ["문서의 성립", "효력발생", "문서의 종류", "문서작성"],
            "검토·협조·결재": ["검토", "협조", "결재"],
            "발송": ["발송"],
            "등록": ["등록"],
        },
        "k-edufine": {
            "전자문서 도착": ["전자문서", "접수 시"],
            "문서 접수": ["문서 접수", "접수"],
            "과제카드 선택": ["과제카드"],
            "결재 및 공람": ["결재", "공람"],
            "기안문 작성": ["문서 기안", "기안문"],
            "발송 처리": ["발송"],
        },
        "official-seals": {
            "공인제작": ["공인의 등록 및 재등록 사유", "공인의 제작"],
            "공인등록(공인대장, 관보→도보)": ["공인등록 절차", "도보공고", "공인대장"],
            "공인사용": ["공인사용"],
            "공인폐기(공인대장, 도보)": ["공인폐기"],
        },
        "acting-duty": {
            "직무대리": ["정의", "직무대리의 종류", "법정대리", "지정대리"],
            "직무대리자 지정": ["직무대리자 지정", "지정방법", "직무대리 명령서"],
        },
        "records": {
            "등록": ["관리범위", "등록"],
            "정리·편철": ["정리", "편철"],
            "이관·보존": ["이관", "보존"],
            "폐기": ["폐기"],
        },
        "facility-security": {
            "보호지역 지정": ["보호지역 구분", "보호지역 지정"],
            "보호지역 대장 작성": ["보호지역대장"],
            "보호지역 표지 부착": ["보호지역 표지"],
            "보호지역 관리": ["보호지역 관리", "출입"],
        },
    },
    3: {
        "performance-appraisal": {
            "근무성적평정서 작성": ["정기평정 시기", "근무성적평정서 작성"],
            "근무성적평정": ["근무성적평정 방법", "근무실적 평정", "직무수행능력 평정", "평정 예외"],
            "평정등급 결정": ["평정등급 결정", "평정자 의견"],
            "평정자료 제출": ["평정서류 제출", "제출자료"],
            "평정결과 공개": ["평정결과 공개", "이의신청"],
        },
        "training": {
            "교육훈련계획 수립(도교육청 총무과)": ["교육훈련 시간", "산출방법", "인정범위"],
            "자기개발계획 수립(지방공무원)": ["자기개발계획 수립"],
            "교육·학습 실시": ["교육·학습 인정범위", "교육훈련·학습"],
            "실적 등록(지방공무원)": ["상시학습 실적 관리", "실적 등록"],
            "교육·학습시간 관리(부서장)": ["개인학습 실적", "교육·학습시간 실적 관리"],
        },
        "awards": {
            "포상대상자 선정": ["포상의 종류", "포상대상자", "추천 제한", "재직기간"],
            "공적조사 및 조서 작성": ["공적조서 작성", "공적내용 조사"],
            "포상추천서류 제출": ["제출"],
        },
        "status-rights": {
            "휴·복직": ["휴직", "복직"],
            "정년퇴직 및 면직": ["직위해제", "정년퇴직", "면직"],
            "소청 및 고충처리": ["소청", "고충처리"],
        },
    },
}


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


def load_data(chapter: int) -> dict[str, object]:
    path = ASSETS / f"chapter{chapter}-data.js"
    prefix = f"window.CHAPTER{chapter}_DATA = "
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw.removeprefix(prefix).removesuffix(";\n"))


def is_heading(line: str) -> bool:
    if line in {"업무 흐름도", "관련법규 및 참고자료", "TIP"}:
        return True
    if line.endswith("세부내용"):
        return True
    if re.match(r"^\d+\.\s*\S", line):
        return True
    if re.match(r"^\d+\s+[가-힣A-Za-z]", line) and len(line) <= 45:
        return True
    return False


def filtered_lines(text: str, printed_page: int) -> list[str]:
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line in ORNAMENTS or line == str(printed_page):
            continue
        lines.append(line)
    return lines


def split_blocks(page: dict[str, object]) -> tuple[list[dict[str, object]], list[str]]:
    lines = filtered_lines(str(page["text"]), int(page["printedPage"]))
    blocks: list[dict[str, object]] = []
    title = f"매뉴얼 {page['printedPage']}쪽"
    title_from_source = False
    body: list[str] = []
    sequence: list[str] = []

    def flush() -> None:
        nonlocal title, title_from_source, body
        if not body and title.startswith("매뉴얼 "):
            return
        block_id = f"p{page['pdfPage']}-b{len(blocks) + 1}"
        blocks.append(
            {
                "id": block_id,
                "title": title,
                "body": "\n".join(body).strip(),
                "pdfPage": page["pdfPage"],
                "printedPage": page["printedPage"],
                "flowStep": "",
                "sourceLineCount": len(body) + (1 if title_from_source else 0),
            }
        )
        body = []

    for line in lines:
        sequence.append(line)
        arrow_flow = "▶" in line and len(line) <= 180
        if is_heading(line) or arrow_flow:
            flush()
            title = "업무 흐름도" if arrow_flow else line
            title_from_source = not arrow_flow
            body = [line] if arrow_flow else []
        else:
            body.append(line)
    flush()

    if sequence != lines:
        raise RuntimeError(
            f"매뉴얼 {page['printedPage']}쪽 구조화 과정에서 원문 순서가 달라졌습니다."
        )
    return blocks, lines


def assign_flow(chapter: int, section: dict[str, object], blocks: list[dict[str, object]]) -> None:
    rules = FLOW_KEYWORDS.get(chapter, {}).get(str(section["id"]), {})
    valid_steps = {
        step
        for group in section.get("flowGroups", [])
        for step in group.get("steps", [])
    }
    for block in blocks:
        searchable = f"{block['title']} {block['body']}"
        scores = []
        for step, keywords in rules.items():
            if step not in valid_steps:
                continue
            score = sum(1 for keyword in keywords if keyword in searchable)
            scores.append((score, step))
        scores.sort(reverse=True)
        if scores and scores[0][0] > 0:
            block["flowStep"] = scores[0][1]


def build(chapter: int) -> None:
    data = load_data(chapter)
    total_source_lines = 0
    total_structured_lines = 0

    for section in data["sections"]:
        content_blocks = []
        for page in section["sourcePages"]:
            blocks, lines = split_blocks(page)
            assign_flow(chapter, section, blocks)
            content_blocks.extend(blocks)
            total_source_lines += len(lines)
            total_structured_lines += sum(block["sourceLineCount"] for block in blocks)
        section["contentBlocks"] = content_blocks

    if total_source_lines != total_structured_lines:
        raise RuntimeError(
            f"제{chapter}편 원문 줄 수 불일치: {total_source_lines} != {total_structured_lines}"
        )

    path = ASSETS / f"chapter{chapter}-data.js"
    path.write_text(
        f"window.CHAPTER{chapter}_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"제{chapter}편: 원문 {total_source_lines}줄 → "
        f"구조화 블록 {sum(len(section['contentBlocks']) for section in data['sections'])}개"
    )


def main() -> None:
    build(1)
    build(3)


if __name__ == "__main__":
    main()
