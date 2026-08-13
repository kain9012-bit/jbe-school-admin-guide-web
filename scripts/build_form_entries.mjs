// 서식 목록을 만듭니다. 화면의 '서식·근거'에 나오는 항목입니다.
//
// build_form_assets.py가 통합 한글파일을 서식별 파일과 미리보기로 쪼개
// docs/assets/form-assets.js(경로 목록)를 만들어 둡니다. 여기서는 그 목록에
// 이름과 '어느 업무의 서식인지'를 붙여 chapterN-data.js의 forms로 넣습니다.
//
// 이름과 업무는 지어내지 않고 매뉴얼 본문에서 찾습니다. 매뉴얼은 서식을 쓸 때
// '일상감사의뢰서[서식1]'처럼 이름 뒤에 번호를 답니다. 그 줄이 있는 업무가
// 그 서식을 쓰는 업무이고, 번호 앞의 말이 서식 이름입니다.
// 본문이 한 번도 부르지 않는 서식은 원문 파일의 첫 줄을 이름으로 씁니다.
//
// 사용법: node scripts/build_form_entries.mjs [--chapters 02,04] [--dry]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runKordoc } from "./lib/kordoc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const work = path.join(root, "tmp", "forms");

const squash = (value) => String(value || "").replace(/\s+/g, "");

function loadFormAssets() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(docs, "assets", "form-assets.js"), "utf8"), context);
  return context.window.FORM_ASSETS || {};
}

function dataPath(chapterId) {
  return path.join(docs, "assets", `chapter${Number(chapterId)}-data.js`);
}

function loadData(chapterId) {
  const raw = readFileSync(dataPath(chapterId), "utf8");
  const head = `window.CHAPTER${Number(chapterId)}_DATA = `;
  return JSON.parse(raw.slice(head.length).replace(/;\s*$/, ""));
}

function saveData(chapterId, data) {
  writeFileSync(
    dataPath(chapterId),
    `window.CHAPTER${Number(chapterId)}_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );
}

// 서식 파일의 글입니다. 이름을 못 찾았을 때 첫 줄을 이름으로 쓰고,
// 검색이 서식 안의 글자도 찾을 수 있게 통째로 담아 둡니다.
function formText(chapterId, downloadPath) {
  const source = path.join(docs, downloadPath);
  if (!existsSync(source)) return { text: "", subject: "" };
  mkdirSync(work, { recursive: true });
  const target = path.join(work, `${chapterId}-${path.basename(downloadPath, ".hwpx")}.md`);
  if (!existsSync(target)) {
    const failed = runKordoc([source, "-o", target, "--silent"]);
    if (failed || !existsSync(target)) return { text: "", subject: "" };
  }
  const raw = readFileSync(target, "utf8");
  // 예시 공문은 '제목' 칸에 무슨 문서인지 적혀 있습니다. 그것이 가장 좋은 이름입니다.
  const subject = /<td[^>]*>\s*제\s*목\s*<\/td>\s*<td[^>]*>([^<]{2,60})<\/td>/.exec(raw);
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[|#*`]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  return { text, subject: subject ? subject[1].trim() : "" };
}

// 매뉴얼 본문이 이 서식을 부르는 자리를 찾습니다.
function findReference(sections, marker) {
  const needle = `[${marker.replace(/^(서식|예시|참고)/, "$1")}]`;
  const loose = new RegExp(
    `\\[\\s*${marker.slice(0, 2)}\\s*${marker.slice(2).replace(/-/g, "\\s*-\\s*")}\\s*\\]`
  );
  for (const section of sections) {
    for (const block of section.contentBlocks || []) {
      const body = String(block.body || "");
      const at = body.includes(needle) ? body.indexOf(needle) : body.search(loose);
      if (at < 0) continue;
      const before = body.slice(Math.max(0, at - 60), at);
      // 번호 바로 앞의 말이 이름입니다. 글머리표·조사에서 끊습니다.
      const name = (before.match(/[가-힣A-Za-z0-9()··\s]+$/) || [""])[0]
        .split(/[\n•‣▸▹▶▪□○◦※]/)
        .pop()
        .replace(/^[\s,·]+/, "")
        .replace(/\s*(?:은|는|이|가|을|를|와|과|의|에|로|으로)$/, "")
        .trim();
      return { sectionId: section.id, title: name };
    }
  }
  return null;
}


// 본문에서 딴 이름이 스물너덧 자를 넘으면 문장 조각입니다. 그때는 서식 안의 제목을 씁니다.
function pickTitle(referenced, subject, text, marker) {
  const short = referenced && [...referenced].length <= 24 ? referenced : "";
  return short || subject || titleFromText(text, marker) || referenced || marker;
}

// 본문이 부르지 않는 서식은 글이 가장 많이 겹치는 업무에 답니다.
const WORDS = /[가-힣]{2,}|[A-Za-z]{3,}/g;
const STOP = new Set(["경우", "관련", "규정", "사항", "내용", "기준", "처리", "해당", "학교", "교육", "업무", "작성", "제출"]);
const bagOf = (value) => (String(value || "").match(WORDS) || []).filter((word) => !STOP.has(word));

function guessSection(sections, text) {
  const asked = new Set(bagOf(text).slice(0, 400));
  let best = sections[0];
  let top = -1;
  for (const section of sections) {
    const corpus = new Set(
      bagOf(section.title + " " + (section.contentBlocks || []).map((b) => `${b.title} ${b.body}`).join(" "))
    );
    let score = 0;
    for (const word of asked) if (corpus.has(word)) score += 1;
    if (score > top) { top = score; best = section; }
  }
  return best;
}

function titleFromText(text, marker) {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length >= 2 &&
        line.length <= 40 &&
        !/^\d+$/.test(line) &&
        // 첫 줄이 번호표뿐인 서식이 있습니다. 그것을 이름으로 쓰면 아무 뜻이 없습니다.
        !/^\[?\s*(서식|예시|참고)\s*\d/.test(line) &&
        // '○ ○ ○ ○ 학 교'처럼 빈칸 표시뿐인 줄은 이름이 아닙니다.
        !/^[\s○□■●◇◆\-_]+$/.test(line.replace(/[가-힣A-Za-z0-9]/g, (c) => (/[학교]/.test(c) ? "" : c))) &&
        (line.match(/[가-힣]/g) || []).length >= 3
    );
  return first || marker;
}

const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
const dry = process.argv.includes("--dry");

const assets = loadFormAssets();
const report = [];

// 제1·3편은 예전에 손으로 다듬어 둔 이름이 있어 그대로 둡니다.
const KEEP = new Set(["01", "03"]);

for (const chapterId of Object.keys(assets).sort()) {
  if (only ? !only.has(chapterId) : KEEP.has(chapterId)) continue;
  if (!existsSync(dataPath(chapterId))) continue;
  const data = loadData(chapterId);
  const markers = Object.keys(assets[chapterId]);
  const forms = [];
  let named = 0;

  for (const marker of markers) {
    const asset = assets[chapterId][marker];
    const { text, subject } = formText(chapterId, asset.download);
    const reference = findReference(data.sections, marker);
    if (reference && reference.title) named += 1;
    forms.push({
      id: marker,
      title: pickTitle(reference && reference.title, subject, text, marker),
      sectionId: (reference && reference.sectionId) || guessSection(data.sections, text).id,
      content: text,
    });
  }

  data.forms = forms;
  for (const section of data.sections) {
    section.formIds = forms.filter((form) => form.sectionId === section.id).map((form) => form.id);
  }
  if (process.env.PEEK) forms.forEach((f) => console.log("   " + f.id + " | " + f.title.slice(0, 40) + " | " + f.sectionId));
  if (!dry) saveData(chapterId, data);

  const spread = data.sections
    .filter((section) => section.formIds.length)
    .map((section) => `${section.title} ${section.formIds.length}`)
    .join(", ");
  report.push(`제${chapterId}편: 서식 ${forms.length}개 (본문에서 이름 찾음 ${named}개) → ${spread}`);
}

report.forEach((line) => console.log(line));
console.log(dry ? "\n미리보기만 했습니다(--dry)." : "\nforms 반영 완료.");
