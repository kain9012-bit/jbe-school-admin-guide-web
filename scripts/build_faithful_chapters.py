from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"


CHAPTERS = {
    1: {
        "title": "행정업무 및 보안",
        "source_dir": ROOT / "tmp" / "extracted",
        "page_offset": 4,
        "sections": [
            ("official-documents", "공문서 관리", [3, 4, 5], "7-9"),
            ("k-edufine", "업무관리시스템(K-에듀파인)", [6, 7], "10-11"),
            ("official-seals", "공인 관리", [8, 9, 10], "12-14"),
            ("acting-duty", "직무대리", [11, 12], "15-16"),
            ("handover", "사무인계인수", [13, 14], "17-18"),
            ("records", "기록물 관리", [15, 16, 17, 18, 19, 20], "19-24"),
            ("background-check", "신원조사 등 전력조회", [21, 22, 23], "25-27"),
            ("cyber-security-day", "사이버보안진단의 날 운영", [24], "28"),
            ("facility-security", "시설보안", [25], "29"),
        ],
        "flows": {
            "official-documents": [
                {"label": "업무 흐름도", "steps": ["문서작성", "검토·협조·결재", "발송", "등록"]}
            ],
            "k-edufine": [
                {
                    "label": "접수 시",
                    "steps": ["전자문서 도착", "문서 접수", "과제카드 선택", "결재 및 공람"],
                },
                {
                    "label": "기안 시",
                    "steps": ["기안문 작성", "과제카드 선택", "결재", "발송 처리"],
                },
            ],
            "official-seals": [
                {
                    "label": "업무 흐름도",
                    "steps": [
                        "공인제작",
                        "공인등록(공인대장, 관보→도보)",
                        "공인사용",
                        "공인폐기(공인대장, 도보)",
                    ],
                }
            ],
            "acting-duty": [
                {"label": "업무 흐름도", "steps": ["직무대리", "직무대리자 지정"]}
            ],
            "records": [
                {"label": "업무 흐름도", "steps": ["등록", "정리·편철", "이관·보존", "폐기"]}
            ],
            "facility-security": [
                {
                    "label": "업무 흐름도",
                    "steps": ["보호지역 지정", "보호지역 대장 작성", "보호지역 표지 부착", "보호지역 관리"],
                }
            ],
        },
        "section_faqs": {
            "official-documents": ["공문서 관리"],
            "k-edufine": ["업무관리시스템"],
            "acting-duty": ["직무대리"],
            "records": ["기록물 관리"],
            "background-check": ["신원조사·결격사유·범죄경력조회"],
        },
        "forms": [
            ("서식1", "공인대장", "official-seals"),
            ("서식2", "전자이미지공인대장", "official-seals"),
            ("서식3", "공인인쇄용지 관리대장", "official-seals"),
            ("서식4", "직무대리 명령서", "acting-duty"),
            ("서식5", "이관목록", "records"),
            ("서식6", "표준 문서고 보존기록대장", "records"),
            ("서식7", "신원진술서", "background-check"),
            ("서식8", "성범죄 경력 및 아동학대관련 범죄 전력 조회 동의서", "background-check"),
            ("서식9", "행정정보공동이용 접근권한 신청서", "background-check"),
            ("서식10", "보호지역대장", "facility-security"),
            ("서식11", "출입통제대장", "facility-security"),
            ("예시1", "기안문서 예시", "official-documents"),
            ("예시2", "공인(전자이미지공인) 등록 기안문", "official-seals"),
            ("예시2-1", "공인(전자이미지공인) 등록 공고 기안문", "official-seals"),
            ("예시3", "도보게재 의뢰 기안문", "official-seals"),
            ("예시4", "폐기 공인 이관 기안문", "official-seals"),
            ("예시5-1", "결격사유 및 범죄경력 유무조회 기안문(단건)", "background-check"),
            ("예시5-2", "결격사유 및 범죄경력 유무조회 기안문(다수건)", "background-check"),
            ("예시6", "채용 대상자 결격사유 및 범죄경력 조회 요청 기안문", "background-check"),
        ],
        "downloads": {
            "manual": "downloads/chapter1-manual.pdf",
            "faq": "downloads/chapter1-faq.hwp",
            "forms": "downloads/chapter1-forms.hwpx",
        },
        "search_examples": ["문서작성", "공인폐기", "기록물 이관", "신원조사"],
    },
    3: {
        "title": "인사관리",
        "source_dir": ROOT / "tmp" / "extracted" / "chapter-03",
        "page_offset": 72,
        "sections": [
            ("local-personnel", "지방공무원 인사", [4, 5, 6, 7, 8, 9], "76-81"),
            ("performance-appraisal", "근무성적평정", [10, 11], "82-83"),
            ("training", "교육훈련", [12, 13], "84-85"),
            ("awards", "포상", [14], "86"),
            ("status-rights", "신분 및 권익보장", [15, 16, 17, 18], "87-90"),
        ],
        "flows": {
            "performance-appraisal": [
                {
                    "label": "업무 흐름도",
                    "steps": ["근무성적평정서 작성", "근무성적평정", "평정등급 결정", "평정자료 제출", "평정결과 공개"],
                }
            ],
            "training": [
                {
                    "label": "업무 흐름도",
                    "steps": [
                        "교육훈련계획 수립(도교육청 총무과)",
                        "자기개발계획 수립(지방공무원)",
                        "교육·학습 실시",
                        "실적 등록(지방공무원)",
                        "교육·학습시간 관리(부서장)",
                    ],
                }
            ],
            "awards": [
                {
                    "label": "업무 흐름도",
                    "steps": ["포상대상자 선정", "공적조사 및 조서 작성", "포상추천서류 제출"],
                }
            ],
            "status-rights": [
                {
                    "label": "업무 흐름도",
                    "steps": ["휴·복직", "정년퇴직 및 면직", "소청 및 고충처리"],
                }
            ],
        },
        "section_faqs": {
            "local-personnel": ["지방공무원 인사"],
            "performance-appraisal": ["근무성적평정"],
            "training": ["교육훈련"],
            "awards": ["포상"],
            "status-rights": ["신분 및 권익보장"],
        },
        "forms": [
            ("서식1", "휴직원", "status-rights"),
            ("서식2", "휴직원(육아휴직용)", "status-rights"),
            ("서식3", "휴직원(출산휴가 연계 육아휴직용)", "status-rights"),
            ("서식4", "휴직연장원", "status-rights"),
            ("서식5", "휴직연장원(육아휴직 연장용)", "status-rights"),
            ("서식6", "복직원", "status-rights"),
            ("서식7", "서약서", "status-rights"),
            ("예시1", "근무성적평정서 자료 제출 공문", "performance-appraisal"),
            ("예시2", "근무성적평정서(1)", "performance-appraisal"),
            ("예시2-1", "근무성적평정서(2)", "performance-appraisal"),
            ("예시3", "실적 및 자격증 가점자, 문책자, 특수지 근무자 현황", "performance-appraisal"),
            ("예시4", "공적조서 예시안(1)", "awards"),
            ("예시4-1", "공적조서 예시안(2)", "awards"),
            ("예시4-2", "공적조서 예시안(3)", "awards"),
            ("예시5", "육아휴직 신청 공문", "status-rights"),
            ("예시5-1", "질병휴직 신청 공문", "status-rights"),
            ("예시5-2", "가사휴직 신청 공문", "status-rights"),
            ("예시6", "휴직기간 만료(소멸)에 따른 복직 신청 공문", "status-rights"),
            ("참고1", "근무성적평정서 평정자 및 확인자", "performance-appraisal"),
            ("참고2", "근무성적평정 감점 및 가산점", "performance-appraisal"),
            ("참고3", "교육·학습 유형별 인정시간 기준", "training"),
        ],
        "downloads": {
            "manual": "downloads/chapter3-manual.pdf",
            "faq": "downloads/chapter3-faq.hwp",
            "forms": "downloads/chapter3-forms.hwpx",
        },
        "search_examples": ["근무성적평정", "교육훈련시간", "공적조서", "육아휴직"],
    },
}


def load_existing_faqs(chapter: int) -> list[dict[str, object]]:
    path = ASSETS / f"chapter{chapter}-data.js"
    prefix = f"window.CHAPTER{chapter}_DATA = "
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw.removeprefix(prefix).removesuffix(";\n"))
    return data.get("faqs", [])


def form_content(text: str, form_ids: list[str], form_id: str) -> str:
    lines = text.splitlines()
    pattern = re.compile(r"^\[([^\]]+)\]")
    occurrences: dict[str, list[int]] = {item: [] for item in form_ids}
    for index, line in enumerate(lines):
        match = pattern.match(line.strip())
        if match and match.group(1) in occurrences:
            occurrences[match.group(1)].append(index)

    own = occurrences[form_id]
    if not own:
        return ""
    start = own[-1]
    next_markers = [
        index
        for other_id, indexes in occurrences.items()
        if other_id != form_id
        for index in indexes
        if index > start
    ]
    end = min(next_markers) if next_markers else len(lines)
    block = lines[start:end]
    while block and block[0].strip() == f"[{form_id}]":
        block.pop(0)
    return "\n".join(line.rstrip() for line in block).strip()


def build_chapter(chapter: int, definition: dict[str, object]) -> None:
    source_dir: Path = definition["source_dir"]
    pages = json.loads((source_dir / "manual-pages.json").read_text(encoding="utf-8"))
    page_map = {int(page["pdf_page"]): page for page in pages}
    existing_faqs = load_existing_faqs(chapter)
    forms_text = (source_dir / "forms.txt").read_text(encoding="utf-8")
    forms_definition = definition["forms"]
    form_ids = [item[0] for item in forms_definition]

    forms = []
    for form_id, title, section_id in forms_definition:
        content = form_content(forms_text, form_ids, form_id)
        if not content:
            raise RuntimeError(f"제{chapter}편 {form_id} 원문을 찾지 못했습니다.")
        forms.append(
            {
                "id": form_id,
                "title": title,
                "sectionId": section_id,
                "content": content,
            }
        )

    sections = []
    outlines = {}
    for number, (section_id, title, pdf_pages, printed_pages) in enumerate(
        definition["sections"], start=1
    ):
        source_pages = []
        for pdf_page in pdf_pages:
            page = page_map[pdf_page]
            printed_page = page.get("printed_page") or pdf_page + int(definition["page_offset"])
            source_pages.append(
                {
                    "pdfPage": pdf_page,
                    "printedPage": printed_page,
                    "text": page["text"],
                }
            )
        section_forms = [form["id"] for form in forms if form["sectionId"] == section_id]
        faq_categories = definition["section_faqs"].get(section_id, [])
        flow_groups = definition["flows"].get(section_id, [])
        sections.append(
            {
                "id": section_id,
                "number": number,
                "title": title,
                "printedPages": printed_pages,
                "pdfPages": pdf_pages,
                "flowGroups": flow_groups,
                "sourcePages": source_pages,
                "formIds": section_forms,
                "faqCategories": faq_categories,
            }
        )
        outlines[section_id] = {"flowGroups": flow_groups}

    data = {
        "meta": {
            "title": "학교행정업무 길라잡이 웹판",
            "chapter": f"제{chapter}편 {definition['title']}",
            "sourceUpdated": "2025-12",
            "manualPages": len(pages),
            "searchExamples": definition["search_examples"],
            "contentPolicy": "매뉴얼·FAQ·서식 원문만 표시",
            "officialBoardUrl": "https://www.jbe.go.kr/board/list.jbe?boardId=BBS_0000085&contentsSid=336&menuCd=DOM_000000106002002000",
        },
        "sections": sections,
        "faqs": existing_faqs,
        "forms": forms,
        "downloads": definition["downloads"],
    }

    (ASSETS / f"chapter{chapter}-data.js").write_text(
        f"window.CHAPTER{chapter}_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    (ASSETS / f"chapter{chapter}-steps.js").write_text(
        f"window.CHAPTER{chapter}_STEPS = "
        + json.dumps(outlines, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"제{chapter}편: 업무 {len(sections)}, FAQ {len(existing_faqs)}, "
        f"개별 서식·예시 {len(forms)}"
    )


def main() -> None:
    for chapter, definition in CHAPTERS.items():
        build_chapter(chapter, definition)


if __name__ == "__main__":
    main()
