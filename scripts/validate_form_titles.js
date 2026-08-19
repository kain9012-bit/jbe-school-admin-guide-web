// 서식 이름이 문장 조각이 아니라 이름인지 확인합니다.
//
// 서식 이름은 원문에서 글자를 주워 만듭니다. 주워 오는 자리를 잘못 고르면
// 화면의 '관련 서식' 줄이 이렇게 됩니다.
//
//   서식1 부양가족이 있을 경우 부양가족신고서
//   서식3 신청자 성 명 직 급
//   참고1 (원천징수동의서
//   참고4 및 기준소득월액 적용 안내
//
// 이런 것들은 뜻이 아니라 모양으로 알아볼 수 있습니다. 괄호 짝이 맞지 않거나,
// 잇는 말로 시작하거나, 표의 칸 이름을 늘어놓았거나, 번호표가 그대로 남아
// 있습니다. 여기서는 그 모양만 봅니다. 어떤 이름이 더 나은지는 따지지 않습니다.
//
// 사용법: node scripts/validate_form_titles.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "docs", "assets");

// 이름 뒤에 '(예시)' 같은 딸림 말이 붙어 있어도 이름은 이름입니다.
const stem = (value) => value.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();
const DOC_TAIL =
  /(?:서|증|장|표|철|록|안|지|부|현황|안내|목록|조서|명세|내역|보고|통보|신고|기안|공고|알림|카드|양식|규정|지침|계획|요령|조례|각서)$/;

// build_form_entries.mjs의 looksLikeHeaderRow와 같은 규칙입니다.
function looksLikeHeaderRow(line) {
  const words = line.split(/\s+/).filter((word) => /[가-힣A-Za-z0-9]/.test(word));
  if (words.length < 3) return false;
  if (words.every((word) => [...word].length === 1)) return false;
  if (DOC_TAIL.test(words[words.length - 1])) return false;
  const ones = words.filter((word) => [...word].length === 1).length;
  return ones >= 3 && ones >= words.length - 2;
}

function bracketsBalanced(value) {
  let depth = 0;
  for (const mark of value) {
    if (mark === "(" || mark === "（" || mark === "〔") depth += 1;
    else if (mark === ")" || mark === "）" || mark === "〕") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

// 이름이 아닌 모양들입니다. 하나라도 걸리면 문장 조각을 그대로 쓴 것입니다.
function faultOf(title, marker) {
  const said = String(title || "").trim();
  if (!said) return "이름이 비어 있습니다";
  if (said === marker) return "번호만 있고 이름이 없습니다";
  if ((said.match(/[가-힣]/g) || []).length < 2) return "한글이 두 자도 안 됩니다";
  if (!bracketsBalanced(said)) return "괄호 짝이 맞지 않습니다";
  if (/^(?:및|또는|그리고)\s/.test(said)) return "잇는 말로 시작합니다";
  if (/^(?:은|는|이|가|을|를|와|과|에|에서|에게|으로|로)\s/.test(said)) {
    return "조사로 시작합니다";
  }
  if (/^(?:[가-힣]\)|\d+\.|[①-⑳])\s/.test(said)) return "차례표가 앞에 남았습니다";
  if (/\[\s*(?:서식|예시|참고)\s*\d/.test(said)) return "서식 번호표가 남았습니다";
  if (/\[\s*별지/.test(said)) return "별지 번호표가 남았습니다";
  if (/\(\s*주\s*[::]/.test(said)) return "숨은 설명이 남았습니다";
  if (/<개정/.test(said)) return "개정 표시가 남았습니다";
  if (/^[■□●【]/.test(said)) return "법령 별지 표시로 시작합니다";
  if (/(?:합니다|습니다|바랍니다)/.test(said)) return "안내 문장입니다";
  if (looksLikeHeaderRow(said)) return "표의 칸 이름을 늘어놓았습니다";
  return "";
}

// 다른 곳에서 규칙만 빌려 쓸 수 있게, 직접 돌릴 때만 검사합니다.
module.exports = { faultOf };
if (require.main !== module) return;

const problems = [];
let checked = 0;

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!fs.existsSync(file)) continue;
  const box = {};
  new Function("window", fs.readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  for (const form of data.forms || []) {
    checked += 1;
    const fault = faultOf(form.title, form.id);
    if (fault) {
      problems.push(
        `제${String(id).padStart(2, "0")}편 ${form.id}: ${fault} — ${JSON.stringify(form.title)}`
      );
    }
  }
}

if (problems.length) {
  problems.slice(0, 30).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n이름이 아닌 서식 ${problems.length}개`);
  process.exit(1);
}
console.log(`서식 ${checked}개 이름이 모두 이름 모양입니다.`);
