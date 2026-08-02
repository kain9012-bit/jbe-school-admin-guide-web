// 매뉴얼의 '관련법규 및 참고자료' 상자가 본문과 섞이지 않았는지 확인합니다.
//
// 지면에서 법령 상자는 법령 줄까지가 끝이고, 그 아래 표나 설명은 별개입니다.
// 상자를 닫아 주지 않으면 표가 '관련법규 및 참고자료' 안으로 딸려 들어갑니다.
// 화면은 법령 상자에서 법령 줄만 뽑아 쓰므로, 그렇게 들어간 표는 통째로 사라집니다.
//
// 그래서 두 방향을 모두 봅니다.
//   1. 상자 안에는 • 항목만 있어야 한다
//      상자 이름이 '관련법규 및 참고자료'이므로 「」로 묶이지 않은 참고자료도
//      들어갑니다. '• 기록물 관리지침', '• 정부 표창 규정' 같은 것입니다.
//   2. 「」로 묶인 법령 줄이 상자 밖으로 흘러나와 있으면 안 된다
//
// 예전에는 블록 번호(p3-b6 같은 것)를 박아 두고 몇 줄인지만 셌습니다.
// 그 방식은 원문을 다시 나눌 때마다 엉뚱한 블록을 보게 되므로 쓰지 않습니다.

const { loadGuideData } = require("./lib/load_guide_data");

const window = loadGuideData();
const LAW_TITLE = "관련법규 및 참고자료";
const LAW_LINE = /^(?:[•‣▶]\s*)?[「『].+[」』](?:\s*제[\d조항호~,.·\s]+.*)?$/;
// 상자 안 항목은 모두 가운뎃점으로 시작합니다.
const BOX_ITEM = /^•\s*\S/;

const problems = [];
let lawBoxes = 0;
let lawLines = 0;

for (const key of ["CHAPTER1_DATA", "CHAPTER3_DATA"]) {
  for (const work of window[key].sections) {
    for (const block of work.contentBlocks) {
      const lines = String(block.body || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const laws = lines.filter((line) => LAW_LINE.test(line));
      const where = `${work.title} ${block.printedPage}쪽 [${block.title.slice(0, 24)}]`;

      if (block.title === LAW_TITLE) {
        lawBoxes += 1;
        lawLines += laws.length;
        if (!lines.length) {
          problems.push(`${where}: 법령 상자가 비어 있습니다.`);
          continue;
        }
        const others = lines.filter((line) => !BOX_ITEM.test(line));
        if (others.length) {
          problems.push(
            `${where}: 상자 안에 항목이 아닌 ${others.length}줄이 섞여 있습니다. ` +
              `('${others[0].slice(0, 30)}')`
          );
        }
      } else if (laws.length) {
        problems.push(
          `${where}: 법령 줄 ${laws.length}개가 상자 밖에 나와 있습니다. ` +
            `('${laws[0].slice(0, 30)}')`
        );
      }
    }
  }
}

if (problems.length) {
  console.error("법령 상자와 본문이 섞여 있습니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(
  `law separation valid: 관련법규·참고자료 상자 ${lawBoxes}개 · 법령 ${lawLines}줄, ` +
    `상자 안에 본문 섞임 없음, 상자 밖으로 흘러나온 법령 없음`
);
