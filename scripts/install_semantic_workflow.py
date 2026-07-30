from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
app_path = ROOT / "docs" / "assets" / "app-faithful-workflow.js"
bootstrap_path = ROOT / "docs" / "assets" / "guide-bootstrap-workflow.js"

app = app_path.read_text(encoding="utf-8")
replacement = r'''function cleanSourceHeading(title) {
    return String(title || "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^\d+\s+/, "")
      .replace(/세부내용$/, "")
      .trim();
  }

  function buildWorkflow(work) {
    const layout = window.GUIDE_WORKFLOW_LAYOUT?.[work.id];
    if (!Array.isArray(layout) || !layout.length) {
      throw new Error(`${work.title}의 의미 구조가 없습니다.`);
    }

    const blockById = new Map(work.contentBlocks.map((block) => [block.id, block]));
    const substantiveBlocks = work.contentBlocks.filter(
      (block) =>
        !isSourceFlowBlock(work, block) &&
        !(block.title === "업무 흐름도" && !block.body)
    );
    const assignedIds = layout.flatMap((step) => step.blocks);
    const duplicateIds = assignedIds.filter(
      (id, index) => assignedIds.indexOf(id) !== index
    );
    const missingIds = substantiveBlocks
      .map((block) => block.id)
      .filter((id) => !assignedIds.includes(id));
    const unknownIds = assignedIds.filter((id) => !blockById.has(id));
    if (duplicateIds.length || missingIds.length || unknownIds.length) {
      throw new Error(
        `${work.title} 의미 구조 오류: 중복 ${duplicateIds.join(",")}; ` +
        `누락 ${missingIds.join(",")}; 알 수 없음 ${unknownIds.join(",")}`
      );
    }

    const steps = layout.map((sourceStep, index) => {
      const stepBlocks = sourceStep.blocks.map((id) => blockById.get(id));
      const mainBlocks = stepBlocks.filter(
        (block) => block.title !== "관련법규 및 참고자료" && block.title !== "TIPTIP"
      );
      const lawBlocks = stepBlocks.filter(
        (block) => block.title === "관련법규 및 참고자료"
      );
      const tipBlocks = stepBlocks.filter((block) => block.title === "TIPTIP");
      const topics = mainBlocks
        .map((block) => cleanSourceHeading(block.title))
        .filter(
          (title) =>
            title &&
            !/^매뉴얼 \d+쪽$/.test(title) &&
            title !== work.title &&
            !topicsStructural(title)
        );
      const uniqueTopics = [...new Set(topics)];
      const summary = uniqueTopics.length
        ? `${uniqueTopics.slice(0, 3).join(", ")}${
            uniqueTopics.length > 3 ? " 등" : ""
          }을 중심으로 확인합니다.`
        : "매뉴얼의 업무 흐름도에 제시된 단계입니다.";
      return {
        id: `step-${index + 1}`,
        title: sourceStep.title,
        blocks: stepBlocks,
        mainBlocks,
        lawBlocks,
        tipBlocks,
        summary,
        pages: uniquePages(stepBlocks),
      };
    });

    const visibleTitles = steps.map((step) => step.title).slice(0, 5);
    const intro = work.flowGroups.length
      ? `${visibleTitles.join(" → ")}${
          steps.length > visibleTitles.length ? " 등" : ""
        }의 흐름으로 업무를 확인합니다.`
      : `${visibleTitles.join(", ")}${
          steps.length > visibleTitles.length ? " 등" : ""
        }의 항목별 기준을 확인합니다.`;
    return {
      intro,
      steps,
      faqCategories: work.faqCategories,
      sourceFlows: work.flowGroups,
    };
  }

  function topicsStructural(title) {
    return /^(공문서 관리|업무관리시스템|공인관리|직무대리|사무인계인수|기록물 관리|신원조사 등 전력조회|사이버보안진단의 날 운영|시설보안|지방공무원 인사|근무성적평정|교육훈련|포상|신분 및 권익보장)$/.test(
      title
    );
  }

  const workflows'''

pattern = re.compile(
    r"function buildWorkflow\(work\) \{.*?\n  \}\n\n  const workflows",
    re.DOTALL,
)
app, count = pattern.subn(lambda _match: replacement, app, count=1)
if count != 1:
    raise SystemExit("buildWorkflow 교체 실패")
app_path.write_text(app, encoding="utf-8", newline="\n")

bootstrap = bootstrap_path.read_text(encoding="utf-8")
old = 'await loadScript(activeChapter.dataScript);\n      const chapterData'
new = (
    'await loadScript(activeChapter.dataScript);\n'
    '      await loadScript("assets/workflow-layout.js");\n'
    '      const chapterData'
)
if old not in bootstrap:
    raise SystemExit("부트스트랩 구조 파일 연결 위치를 찾지 못했습니다.")
bootstrap = bootstrap.replace(old, new, 1)
bootstrap_path.write_text(bootstrap, encoding="utf-8", newline="\n")

print("installed semantic workflow layout")
