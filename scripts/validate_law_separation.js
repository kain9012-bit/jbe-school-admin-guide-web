const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "docs/assets/chapter1-data.js"), "utf8"),
  context
);

const blocks = context.window.CHAPTER1_DATA.sections.flatMap(
  (section) => section.contentBlocks
);
const byId = new Map(blocks.map((block) => [block.id, block]));
const lawPattern =
  /^(?:[•‣▶]\s*)?[「『].+[」』](?:\s*제[\d조항호~,.·\s]+.*)?$/;

function lawCount(blockId) {
  return byId
    .get(blockId)
    .body.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => lawPattern.test(line)).length;
}

if (lawCount("p3-b6") !== 2) {
  throw new Error("공문서 관리의 법령 전용 블록을 정확히 판별하지 못했습니다.");
}
if (lawCount("p4-b2") !== 2) {
  throw new Error("일반 내용 끝에 붙은 법령 문장을 정확히 분리하지 못했습니다.");
}

console.log("law separation valid: law-only and mixed-content blocks checked");
