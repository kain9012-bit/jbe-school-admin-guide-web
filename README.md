# 전북 학교행정업무 길라잡이 웹판

전북특별자치도교육청 「학교행정업무 길라잡이」를 업무 흐름과 검색 중심의
웹 안내서로 재구성한 제안용 시범 프로젝트입니다.

## 제1편 시범판

- 제1편 행정업무 및 보안 9개 업무
- 실제 처리 순서로 나눈 45개 단계
- 각 단계에 할 일, 확인사항, 주의·예외, 서식, 근거, 원문 쪽수 통합
- FAQ 55건과 서식·예시 19종 연결
- 공개된 모든 편을 한 번에 찾는 통합검색
- FAQ 검색 결과에서 해당 업무 단계로 이동하고 답변 자동 펼침
- 원문 PDF·HWP·HWPX 내려받기
- KRDS 기반 반응형·키보드 접근 화면

## 콘텐츠 구성 원칙

- 원문 텍스트를 별도 덩어리로 노출하지 않습니다.
- 업무 흐름의 각 단계 안에서 필요한 원문 내용을 실무 문장으로 제공합니다.
- 서식·FAQ·근거·원문 쪽수를 해당 단계에 함께 배치합니다.
- 원본 문서를 정본으로 유지하고 최종 판단은 최신 원문과 관련 규정을 확인합니다.
- 원문과 웹 재구성 결과는 공개 전에 업무 담당자가 대조 검수합니다.

## 프로젝트 구성

- `docs/`: GitHub Pages에 게시할 정적 사이트
- `docs/assets/chapter1-steps.js`: 제1편 단계별 실무 콘텐츠
- `docs/assets/chapter1-data.js`: FAQ·서식·기본 메타데이터
- `docs/vendor/krds/`: KRDS 배포 CSS·JavaScript·Pretendard GOV 글꼴
- `source/chapter-01/original/`: 교육청 원본 자료
- `scripts/`: 원문 추출, 데이터 생성, 화면 검증 도구

## 통합검색과 FAQ

홈 화면과 상단 검색은 먼저 편을 선택하지 않아도 공개된 모든 편의 업무, 처리 단계,
FAQ, 서식·예시를 한 번에 검색합니다. 결과에는 편 이름과 자료 유형이 함께 표시되며,
다른 편의 결과를 선택하면 해당 편과 업무 단계로 바로 이동합니다. FAQ 결과는 질문이
있는 단계로 이동한 뒤 해당 답변을 자동으로 펼칩니다.

통합검색은 `docs/assets/guide-search-index.js`를 사용합니다. 편별 데이터가 바뀌거나
새 편을 공개한 뒤에는 `node scripts/build_global_search_index.js`를 실행해 색인을
갱신합니다.

HWP·HWPX·PDF 원문을 새 편의 구조화 데이터로 변환할 때는
[`kordoc`](https://github.com/chrisryugj/kordoc)을 추출 도구로 활용할 수 있습니다.
웹 화면은 변환된 JavaScript 데이터를 사용하므로 이용자의 브라우저에 `kordoc`이 필요하지 않습니다.

## 화면 구성

진입 페이지는 `docs/index.html` 하나입니다. 편마다 따로 페이지를 두지 않습니다.

- 주소에 편을 지정하지 않으면 통합 홈이 열립니다.
- `?chapter=03`처럼 편만 지정하면 통합 홈에서 그 분야를 펼쳐 보여 줍니다.
- `?chapter=03#work=local-personnel`처럼 업무까지 지정하면 처리 단계 화면이 열립니다.

홈과 똑같이 생긴 편별 개요 화면을 따로 두면 이용자가 어디로 왔는지 헷갈리므로
중간 단계를 없애고 홈에서 바로 업무로 이어지게 했습니다.

## 로컬 확인

`docs` 폴더를 정적 웹 서버로 열어 확인합니다. 기본 페이지는 `docs/index.html`입니다.

## 공개 순서

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. 저장소의 **Settings → Pages**에서 배포 원본을 `main` 브랜치의 `/docs`로 설정합니다.
3. 생성된 GitHub Pages 주소에서 업무 이동, 검색, 파일 내려받기를 최종 확인합니다.

## 출처와 라이선스

- 안내서 원본: 전북특별자치도교육청 학교행정업무 길라잡이
- UI 기반: KRDS UI/UX (`KRDS-uiux/krds-uiux`, ISC)
- 자세한 표기는 `NOTICE.md`를 확인하세요.

## 검증 스크립트

`node scripts/validate_<이름>.js` 형태로 실행합니다. 모두 저장소 파일만 읽으므로
브라우저나 인터넷 연결이 없어도 동작합니다.

- `validate_structured_site.js`: 구조화 블록을 다시 이어 붙였을 때 원문 PDF 쪽의
  줄 순서·내용과 정확히 같은지 대조합니다.
- `validate_faithful_site.js`: 원문에 없는 할 일·확인사항을 지어내지 않았는지,
  원문 쪽·서식 원문·통합검색 구성이 온전한지 확인합니다.
- `validate_chapter3.js`: 제3편 자료와 의미 단계 배치의 무결성을 확인합니다.
- `validate_global_home.js`: 19개 편 통합 홈과 편 미지정 진입 흐름을 확인합니다.
- `validate_self_hosted_assets.js`: 화면 자산이 모두 저장소 안에 있는지 확인합니다.
- `validate_form_previews.py`: 서식 미리보기에 겹쳐 그려진 글자가 없는지, 내려받기
  HWPX가 원본의 용지·여백·단 설정을 지키는지 확인합니다.
- `validate_layout_matches_source.js`: 업무 안의 목차가 매뉴얼 소제목과 일치하는지,
  지어낸 제목이나 빈 항목이 없는지 확인합니다.
- `validate_block_presentation.js`: 본문을 접어 두거나 두 번 싣지 않는지 확인합니다.
- `validate_search_quality.js`: 문장으로 검색해도 관련 결과가 위에 오는지 확인합니다.
- 그 밖에 표 너비, 목록 들여쓰기, 법령 분리, 본문 FAQ 표현을 각각 확인합니다.

`scripts/inspect_live_ui.js`는 실제 브라우저로 화면을 열어 콘솔 오류, 끊어진 링크,
가로 넘침, 모바일 화면을 점검합니다. `docs`를 정적 서버로 띄운 뒤 실행합니다.

```
python3 -m http.server 8899 --directory docs
node scripts/inspect_live_ui.js http://127.0.0.1:8899
```

## 서식 자산 다시 만들기

서식별 내려받기 파일과 미리보기는 `scripts/build_form_assets.py`가 만듭니다.
미리보기 렌더링에 [`kordoc`](https://github.com/chrisryugj/kordoc)이 필요합니다.

```
npm install kordoc
KORDOC_CLI="node ./node_modules/kordoc/dist/cli.js" python3 scripts/build_form_assets.py
python3 scripts/validate_form_previews.py
```

통합 서식 파일에서 서식 하나를 떼어낼 때 두 가지를 지킵니다.

- 구역 설정은 `secPr`과 단 설정(`ctrl/colPr`)이 한 묶음입니다. 둘 중 하나만 옮기면
  한글이 용지·여백을 기본값으로 되돌리므로 묶음째 옮깁니다.
- 미리보기는 떼어낸 파일에서 한글이 저장한 조판 캐시를 지운 사본으로 렌더링합니다.
  원본 캐시는 통합 문서 기준이라 그대로 쓰면 제목이 표 위에 겹쳐 그려집니다.
  내려받기용 파일은 캐시를 그대로 둡니다.

## 업무 안의 목차를 만드는 방식

업무 하나를 열면 왼쪽에 목차가 나옵니다. 이 목차는 사람이 정하지 않고
`scripts/build_workflow_layout.js`가 매뉴얼에서 뽑아냅니다.

```
node scripts/build_workflow_layout.js
node scripts/validate_layout_matches_source.js
```

매뉴얼이 `1. 정의 / 2. 구분 / 3. 지정 절차`로 나눠 놓았으면 화면도 그대로 나눕니다.
각 항목의 내용은 원문에서 그 소제목 아래 있던 것 그대로이고 순서도 바꾸지 않습니다.
소제목 없이 다음 쪽으로 이어지는 내용은 매뉴얼이 그 자리에 붙여 둔 구역 이름
(`직무대리자 지정세부내용` 등)을 제목으로 씁니다.

예전에는 업무 흐름도에서 단계 이름만 가져다 놓고 본문을 앞에서부터 순서대로
부어 넣었습니다. 그 결과 '기안문 작성' 단계에 지정 방법 표가 들어가는 일이
생겼습니다. 어느 내용을 어디에 넣을지 사람이 정해야 했기 때문입니다.
매뉴얼 구조를 그대로 따르면 그 판단이 필요 없어지고, 검수도 '매뉴얼과 같은가'만
보면 됩니다. 흐름도는 매뉴얼에 있는 그림이므로 목차 아래에 따로 보여 줍니다.
