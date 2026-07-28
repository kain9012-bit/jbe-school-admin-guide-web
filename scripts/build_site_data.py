from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "tmp" / "extracted"
OUTPUT = ROOT / "docs" / "assets" / "chapter1-data.js"


SECTION_DEFINITIONS = [
    {
        "id": "official-documents",
        "number": 1,
        "title": "공문서 관리",
        "summary": "공문서의 성립과 효력, 작성 원칙, 검토·협조·결재 방법을 확인합니다.",
        "printedPages": "7-9",
        "pdfPages": [3, 4, 5],
        "keywords": ["문서작성", "기안", "협조", "병렬협조", "결재", "전결", "대결", "발송", "등록", "공문서"],
        "flows": [
            {
                "title": "공문서 처리 기본 흐름",
                "steps": ["문서 작성", "검토·협조", "결재", "발송", "등록"],
            }
        ],
        "highlights": [
            "문서는 결재권자의 서명 방식 결재로 성립합니다.",
            "전자문서는 수신자가 지정한 전자시스템에 입력되면 도달한 것으로 봅니다.",
            "날짜·시간·금액·붙임·문서의 끝 표시는 정해진 작성 원칙을 따릅니다.",
        ],
    },
    {
        "id": "k-edufine",
        "number": 2,
        "title": "업무관리시스템",
        "summary": "K-에듀파인에서 문서를 접수·공람하거나 기안·결재·발송하는 절차입니다.",
        "printedPages": "10-11",
        "pdfPages": [6, 7],
        "keywords": ["K-에듀파인", "접수대기", "공람", "과제카드", "수신자", "재정기안", "발송대기", "비전자문서"],
        "flows": [
            {
                "title": "문서 접수",
                "steps": ["전자문서 도착", "문서 접수", "담당자·결재경로 지정", "과제카드 선택", "결재·공람"],
            },
            {
                "title": "문서 기안·발송",
                "steps": ["기안문 작성", "과제카드·공개여부 설정", "결재경로·수신자 지정", "결재", "발송 처리"],
            },
        ],
        "highlights": [
            "비전자문서는 시스템에 등록한 뒤 원본을 관련 규정에 따라 별도 보관합니다.",
            "인사이동 시 담당 단위과제카드를 지정해야 문서 접수와 기안이 가능합니다.",
            "위임전결 사항은 결재경로에서 처리방법을 전결로 설정합니다.",
        ],
    },
    {
        "id": "official-seals",
        "number": 3,
        "title": "공인 관리",
        "summary": "공인의 제작·등록·사용·보관·폐기와 기록관 이관 절차를 안내합니다.",
        "printedPages": "12-14",
        "pdfPages": [8, 9, 10],
        "keywords": ["공인", "직인", "청인", "전자이미지공인", "공인대장", "도보", "인영", "폐기공인"],
        "flows": [
            {
                "title": "공인 생애주기",
                "steps": ["공인 제작", "공인대장 등록", "도보 공고", "사용·보관", "폐기 기록·공고", "관할 기록관 이관"],
            }
        ],
        "highlights": [
            "공인 등록·재등록 시 공인대장과 전자이미지공인대장에 등록하고 도보에 공고합니다.",
            "공인은 견고한 용기함에 잠금장치하여 보관하고 보관자가 결재문서와 대조한 뒤 날인합니다.",
            "폐기 공인은 학교에서 직접 처분하지 않고 관할 기록관으로 이관합니다.",
        ],
    },
    {
        "id": "acting-duty",
        "number": 4,
        "title": "직무대리",
        "summary": "공석·휴가·출장 등으로 직무 공백이 생길 때 법정대리와 지정대리를 구분합니다.",
        "printedPages": "15-16",
        "pdfPages": [11, 12],
        "keywords": ["직무대리", "법정대리", "지정대리", "대리결재", "직무대리명령서", "임시출납원"],
        "flows": [
            {
                "title": "직무대리자 지정",
                "steps": ["사고 발생 확인", "법정대리 여부 판단", "지정대리자 결정", "명령서 작성·교부", "부재·대리결재 설정"],
            }
        ],
        "highlights": [
            "법정대리는 직제 순위에 따라 차하급자가 순차적으로 대리하며 명령서가 필요하지 않습니다.",
            "지정대리는 기관장이 소속 공무원 중 지정하고 직무대리 명령서를 교부합니다.",
            "사고기간이 15일 이내이면 명령서 교부를 생략하고 내부통신망 등으로 통지할 수 있습니다.",
        ],
    },
    {
        "id": "handover",
        "number": 5,
        "title": "사무 인계·인수",
        "summary": "학교장·행정실장·학교운영위원장 교체 시 장부 마감과 인계인수서 작성 기준입니다.",
        "printedPages": "17-18",
        "pdfPages": [13, 14],
        "keywords": ["인계인수", "인사발령", "현금출납부", "재산대장", "물품대장", "발전기금", "보안담당관"],
        "flows": [
            {
                "title": "인사발령 후 인계·인수",
                "steps": ["인사발령·교체", "회계·재산·물품 장부 마감", "인계인수서 작성", "인계·인수자 연서 날인", "비전자 등록·보관"],
            }
        ],
        "highlights": [
            "학교장과 대부분의 출납원 업무는 발령 후 5일 이내 인계·인수합니다.",
            "학교발전기금회계 출납원은 7일 이내, 출납명령기관 교체는 14일 이내 기준을 확인합니다.",
            "연계기안과 진행문서는 처리·회수·삭제하여 완료해야 소속 변경이 가능합니다.",
        ],
    },
    {
        "id": "records",
        "number": 6,
        "title": "기록물 관리",
        "summary": "전자·비전자 기록물의 등록, 정리·편철, 이관·보존, 평가·폐기 절차입니다.",
        "printedPages": "19-24",
        "pdfPages": [15, 16, 17, 18, 19, 20],
        "keywords": ["기록물", "비전자문서", "편철", "이관", "보존", "폐기", "보존기록대장", "문서고", "단위과제카드"],
        "flows": [
            {
                "title": "기록물 관리",
                "steps": ["기록물 등록", "정리·편철", "처리과 보관", "기록물관리부서 이관", "보존", "평가·폐기"],
            }
        ],
        "highlights": [
            "비전자문서는 업무관리시스템에 등록번호를 부여받아 원본에 표시합니다.",
            "전년도 생산·완결 기록물은 매년 2월 말까지 공개여부·접근권한·편철 등을 정리합니다.",
            "학교에서는 기록물을 임의로 폐기할 수 없으며 기록관의 평가·심의 절차를 거칩니다.",
        ],
    },
    {
        "id": "background-check",
        "number": 7,
        "title": "신원조사 등 전력 조회",
        "summary": "신원조사, 결격사유와 범죄경력 조회, 행정정보공동이용 권한 절차를 확인합니다.",
        "printedPages": "25-27",
        "pdfPages": [21, 22, 23],
        "keywords": ["신원조사", "결격사유", "범죄경력", "성범죄", "아동학대", "e하나로민원", "행정정보공동이용", "채용"],
        "flows": [
            {
                "title": "채용 대상 조회",
                "steps": ["조회 대상·근거 확인", "동의서·내부결재 준비", "열람권한 신청", "e하나로민원 조회", "결과 확인·보안관리", "담당 변경 시 권한 반납"],
            }
        ],
        "highlights": [
            "조회 목적과 채용 대상에 따라 신원조사·결격사유·범죄경력 조회를 구분합니다.",
            "행정정보공동이용 시스템 조회 전 내부결재와 필요한 동의서를 갖춥니다.",
            "결과에 개인정보가 포함되므로 누설에 주의하고 담당자가 바뀌면 권한을 즉시 반납합니다.",
        ],
    },
    {
        "id": "cyber-security-day",
        "number": 8,
        "title": "사이버보안진단의 날",
        "summary": "매월 세 번째 수요일에 내PC지키미와 월별 중점 점검사항을 수행합니다.",
        "printedPages": "28",
        "pdfPages": [24],
        "keywords": ["사이버보안진단", "내PC지키미", "정보보안", "일반보안", "보안감사", "패스워드", "백신"],
        "flows": [
            {
                "title": "월간 보안진단",
                "steps": ["매월 셋째 수요일 확인", "내PC지키미 실행", "취약점 조치", "월별 중점사항 점검", "점검 결과 관리"],
            }
        ],
        "highlights": [
            "시행일이 공휴일이면 같은 달의 다른 날을 지정하여 실시합니다.",
            "백신·보안패치, 로그인 비밀번호, 개인정보 노출, 저장매체 관리 등을 점검합니다.",
            "보안감사는 일반보안과 정보보안 전반을 대상으로 3년 주기로 실시합니다.",
        ],
    },
    {
        "id": "facility-security",
        "number": 9,
        "title": "시설 보안",
        "summary": "제한지역·제한구역·통제구역을 지정하고 출입과 보호시설을 관리합니다.",
        "printedPages": "29",
        "pdfPages": [25],
        "keywords": ["시설보안", "보호지역", "제한지역", "제한구역", "통제구역", "출입통제대장", "전산실", "문서고"],
        "flows": [
            {
                "title": "보호지역 지정·관리",
                "steps": ["보호지역 구분·지정", "보호지역대장 작성", "표지 부착", "출입통제대장 비치", "출입·시설 관리"],
            }
        ],
        "highlights": [
            "제한지역·제한구역·통제구역을 보안 중요도와 출입통제 수준에 따라 구분합니다.",
            "제한·통제구역에는 출입통제대장을 비치하고 고정출입자 외 출입상황을 관리합니다.",
            "출입통제, 주야 경계, 방화·경보, 투시·도청·파괴 방지 대책을 마련합니다.",
        ],
    },
]


FORM_TITLES = [
    ("서식1", "공인대장"),
    ("서식2", "전자이미지공인대장"),
    ("서식3", "공인인쇄용지 관리대장"),
    ("서식4", "직무대리 명령서"),
    ("서식5", "이관목록"),
    ("서식6", "표준 문서고 보존기록대장"),
    ("서식7", "신원진술서"),
    ("서식8", "성범죄 경력 및 아동학대관련 범죄 전력 조회 동의서"),
    ("서식9", "행정정보공동이용 접근권한 신청서"),
    ("서식10", "보호지역대장"),
    ("서식11", "출입통제대장"),
    ("예시1", "기안문서 예시"),
    ("예시2", "공인(전자이미지공인) 등록 기안문"),
    ("예시2-1", "공인(전자이미지공인) 등록 공고 기안문"),
    ("예시3", "도보게재 의뢰 기안문"),
    ("예시4", "폐기 공인 이관 기안문"),
    ("예시5-1", "결격사유 및 범죄경력 유무조회 기안문(단건)"),
    ("예시5-2", "결격사유 및 범죄경력 유무조회 기안문(다수건)"),
    ("예시6", "채용 대상자 결격사유 및 범죄경력 조회 요청 기안문"),
]


def parse_faq(text: str) -> list[dict[str, str | int]]:
    lines = [line.strip() for line in text.splitlines()]
    marks = [
        (index, int(re.search(r"\d+", line).group()))
        for index, line in enumerate(lines)
        if re.fullmatch(r"QA\s*\d+", line)
    ]
    categories = [
        "업무관리시스템",
        "공문서 관리",
        "기록물 관리",
        "신원조사·결격사유·범죄경력조회",
        "직무대리",
    ]
    category_index = 0
    results = []

    for marker_index, (start, number) in enumerate(marks):
        if marker_index and number == 1:
            category_index = min(category_index + 1, len(categories) - 1)
        end = marks[marker_index + 1][0] if marker_index + 1 < len(marks) else len(lines)
        block = [line for line in lines[start + 1 : end] if line]
        if block and re.match(r"QA\s*\d+\D", block[-1]):
            block.pop()
        while block and (block[0] in {"Q", "A"} or re.fullmatch(r"\d+", block[0])):
            block.pop(0)
        if not block:
            continue

        answer_start = next(
            (
                index
                for index, line in enumerate(block)
                if line.startswith(("･", "․", "•", "【", "- "))
            ),
            1,
        )
        title = " ".join(block[:answer_start]).strip()
        answer = "\n".join(block[answer_start:]).strip()
        results.append(
            {
                "id": f"faq-{category_index + 1}-{number}",
                "category": categories[category_index],
                "number": number,
                "question": title,
                "answer": answer,
            }
        )
    return results


def main() -> None:
    pages = json.loads((EXTRACTED / "manual-pages.json").read_text(encoding="utf-8"))
    page_map = {page["pdf_page"]: page["text"] for page in pages}
    faq_text = (EXTRACTED / "faq.txt").read_text(encoding="utf-8")
    forms_text = (EXTRACTED / "forms.txt").read_text(encoding="utf-8")

    sections = []
    for definition in SECTION_DEFINITIONS:
        section = dict(definition)
        section["body"] = "\n\n".join(page_map[number] for number in definition["pdfPages"])
        sections.append(section)

    data = {
        "meta": {
            "title": "학교행정업무 길라잡이 웹판",
            "chapter": "제1편 행정업무 및 보안",
            "sourceUpdated": "2025-12",
            "manualPages": 37,
            "officialBoardUrl": "https://www.jbe.go.kr/board/list.jbe?boardId=BBS_0000085&contentsSid=336&menuCd=DOM_000000106002002000",
        },
        "sections": sections,
        "faqs": parse_faq(faq_text),
        "forms": [
            {"id": form_id, "title": title, "searchText": f"{form_id} {title}"}
            for form_id, title in FORM_TITLES
        ],
        "formsFullText": forms_text,
        "downloads": {
            "manual": "downloads/chapter1-manual.pdf",
            "faq": "downloads/chapter1-faq.hwp",
            "forms": "downloads/chapter1-forms.hwpx",
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "window.CHAPTER1_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"sections: {len(sections)}")
    print(f"faqs: {len(data['faqs'])}")
    print(f"forms: {len(data['forms'])}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
