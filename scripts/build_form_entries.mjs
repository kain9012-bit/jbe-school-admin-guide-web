// 서식 목록을 만듭니다. 화면의 '서식·근거'에 나오는 항목입니다.
//
// build_form_assets.py가 통합 한글파일을 서식별 파일과 미리보기로 쪼개
// docs/assets/form-assets.js(경로 목록)를 만들어 둡니다. 여기서는 그 목록에
// 이름과 '어느 업무의 서식인지'를 붙여 chapterN-data.js의 forms로 넣습니다.
//
// 이름은 지어내지 않고 원문에서 찾습니다. 찾는 자리를 좋은 것부터 봅니다.
//
//   1) 서식 파일 첫 줄의 번호 뒤       '[서식3] 출산축하 복지점수 신청서'
//   2) 예시 공문의 '제목' 칸           '○○ 위탁 용역 공고 개찰 결과 보고'
//   3) 서식 표 맨 윗줄의 제목 칸       '하자보수보증금 납부서'
//   4) 표 밖에 홀로 적힌 제목 줄        '기준소득월액 적용 안내'
//   5) 매뉴얼 본문이 부르는 이름        '일상감사의뢰서[서식1]'의 앞말
//
// 예전에는 5)를 가장 먼저 썼습니다. 그런데 본문은 서식을 문장 속에서 부르므로
// 번호 앞 60자를 잘라 쓰면 문장 조각이 그대로 이름이 됩니다.
//
//   '(원천징수동의서[참고1], …'          → '(원천징수동의서'
//   '…민원 등록(민원처리부[서식1]에 기재)' → '국민신문고 시스템에 민원 등록(민원처리부'
//   '…토․공휴일 제외)에 일상감사 의견서[서식2]' → '공휴일 제외)에 일상감사 의견서'
//
// 서식 파일에는 그 서식의 진짜 이름이 적혀 있으므로 그쪽을 먼저 봅니다.
// 본문에서 딴 이름도 짝 없는 괄호에서 자르고 앞에 붙은 군말을 떼어 씁니다.
//
// 업무는 그대로 본문에서 찾습니다. 서식 번호를 부른 줄이 있는 업무가
// 그 서식을 쓰는 업무입니다.
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

// 이름에 섞여 들어오는 군말을 뗍니다.
//
// 가장 자주 걸리는 것이 짝이 맞지 않는 괄호입니다. 본문은 서식을 괄호 안에서
// 부르기도 하고(…민원 등록(민원처리부[서식1]에 기재)), 번호 앞 60자를 자르는
// 바람에 괄호가 반만 딸려 오기도 합니다(…공휴일 제외)에 일상감사 의견서).
// 어느 쪽이든 짝 없는 괄호 앞은 다른 말입니다. 거기서 자릅니다.
// 글머리표는 뒤에 빈칸이 따라올 때만 뗍니다. '○○고등학교'의 ○○는
// 이름을 가린 표시라, 글머리표로 보고 떼면 '고등학교'만 남습니다.
const ENUMERATOR = /^(?:[가-힣]\)|\(?\d+\)|\d+\.|[①-⑳㉠-㉻]|[※*·•‣▸▹▶▪□○◦–-]\s)\s*/;
// '및', '또는'처럼 앞말과 잇던 말이 맨 앞에 남으면 이름이 아닙니다.
const JOINER = /^(?:및|또는|그리고|각|등)\s+/;
// '대리인일 경우 위임장', '부양가족이 있을 경우 부양가족신고서'처럼
// 언제 쓰는지를 앞에 붙여 부르는 일이 많습니다. 그 부분은 이름이 아닙니다.
const WHEN = /^.{2,20}?(?:경우|때|시)\s+(?=\S)/;
// 괄호를 자르고 나면 조사만 홀로 남기도 합니다('제외)에 일상감사 의견서').
const ORPHAN = /^(?:은|는|이|가|을|를|와|과|의|에|에서|에게|으로|로)\s+/;
// '업무담당자가 정보공개 구술 청구서', '관할 지자체에 건축물 말소신청서'처럼
// 이름 앞에 딴 말이 붙는 일이 있습니다. 조사로 끝나는 마디까지 버립니다.
// 다만 아주 좁게만 봅니다. '초 과 근 무 명 령 서'의 '과', '신청서(학교에서'의
// '에서'까지 조사로 보면 이름이 통째로 잘려 나갑니다. 그래서
//   · 세 글자 이상인 한 마디이고
//   · 괄호가 섞여 있지 않으며
//   · 버린 뒤에도 두 마디 넘게 남을 때
// 만 버립니다. '의'는 이름에 들어가는 말이라 조사로 세지 않습니다.
const PARTICLE = /^[가-힣]{2,}(?:은|는|이|가|을|를|와|과|에|에서|에게|으로|로)$/;

function cutAtLooseBracket(value) {
  // 짝 없는 괄호가 마지막으로 나오는 자리를 찾습니다. 그 뒤가 이름입니다.
  let depth = 0;
  let cut = 0;
  for (let at = 0; at < value.length; at += 1) {
    const mark = value[at];
    if (mark === "(" || mark === "（" || mark === "〔") depth += 1;
    else if (mark === ")" || mark === "）" || mark === "〕") {
      if (depth) depth -= 1;
      else cut = at + 1;
    }
  }
  if (depth > 0) {
    // 닫히지 않은 괄호가 남았습니다. 마지막으로 열린 자리 뒤가 이름입니다.
    let open = 0;
    for (let at = cut; at < value.length; at += 1) {
      const mark = value[at];
      if (mark === "(" || mark === "（" || mark === "〔") open = at + 1;
      else if (mark === ")" || mark === "）" || mark === "〕") open = 0;
    }
    if (open) cut = open;
  }
  return value.slice(cut);
}

function dropLeadWords(value) {
  const words = value.replace(WHEN, "").split(" ").filter(Boolean);
  let cut = 0;
  for (let at = 0; at < words.length - 2; at += 1) {
    if (PARTICLE.test(words[at])) cut = at + 1;
  }
  return words.slice(cut).join(" ");
}

// 서식 이름은 '…신청서', '…대장', '…일지'처럼 문서를 가리키는 말로 끝납니다.
// 표 안에서 주운 줄을 이름으로 쓸 때는 이 조건을 걸어야 '행정기관명',
// '작성방법', '주민등록번호' 같은 칸 이름이 서식 이름으로 올라오지 않습니다.
const DOC_TAIL =
  /(?:서|증|장|표|철|록|안|지|부|현황|안내|목록|조서|명세|내역|보고|통보|신고|기안|공고|알림|카드|양식|규정|지침|계획|요령|조례|각서)$/;
// 반대로 '…여부', '…사항', '…내용'으로 끝나면 표의 칸 이름입니다.
const FIELD_TAIL = /(?:여부|사항|내용|방법|기재|참조|시행규칙|시행령)$/;
// '…에는 해당되는 곳에 √표를 합니다'처럼 문장으로 끝나면 이름이 아니라 안내 글입니다.
const SENTENCE = /(?:합니다|습니다|됩니다|바랍니다|하십시오|하시기)/;
// '통하여 사업장 신고', '발부하되 납부독려 기안문'처럼 문장 한가운데를 자른 것입니다.
const MID_SENTENCE = /^[가-힣]{1,5}(?:하여|하고|하되|되어|따라|위하여|통하여|받아|하는)\s/;
// 결재란의 칸 이름입니다. 이것만으로 이루어진 줄은 서식 이름이 아닙니다.
const STAMP = new Set([
  "담당", "담당자", "행정실장", "교장", "교감", "결재", "확인",
  "검토", "협조", "전결", "기관장", "과장", "부장",
]);
// 이름 뒤에 '(예시)', '(안)'처럼 딸린 말이 붙어 있어도 이름은 이름입니다.
const stem = (value) => value.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();

function looksLikeDocName(value) {
  const said = String(value || "").trim();
  if (said.length < 3 || said.length > 40) return false;
  if ((said.match(/[가-힣]/g) || []).length < 3) return false;
  if (looksLikeHeaderRow(said)) return false;
  // '주관부서: 최종결재자'처럼 쌍점이 든 줄은 채워 넣는 칸이지 이름이 아닙니다.
  if (/[:：]/.test(said)) return false;
  if (SENTENCE.test(said) || MID_SENTENCE.test(said)) return false;
  // '담당자 행정실장 교장'은 결재란입니다.
  if (said.split(/\s+/).every((word) => STAMP.has(word))) return false;
  // '(앞 쪽)', '■ 도시가스사업법 시행규칙' 같은 곁줄은 이름이 아닙니다.
  if (/^[※◦○▪□■●【#]/.test(said)) return false;
  if (/^\(?\s*(?:앞|뒤)\s*쪽/.test(said)) return false;
  const core = stem(said) || said;
  return DOC_TAIL.test(core) && !FIELD_TAIL.test(core);
}

function cleanName(value) {
  let name = String(value || "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    // kordoc은 한글의 숨은 설명을 '(주: …)'로 붙여 옵니다. 이름이 아닙니다.
    .replace(/\(\s*주\s*[::][^)]*\)/g, " ")
    // '[서식3]', '[별지 제12호서식] <개정 2010.11.5>' 같은 번호표입니다.
    .replace(/\[\s*(?:서식|예시|참고)\s*\d[^\]]*\]/g, " ")
    .replace(/\[\s*별지[^\]]*\]/g, " ")
    .replace(/<개정[^>]*>/g, " ")
    .replace(/[│|]/g, " ")
    // kordoc은 '~'를 '\~'로 적어 옵니다. 화면에는 물결표만 보여야 합니다.
    .replace(/\\(?=[~*_[\]])/g, "")
    // '[ ] 완성검사 신청서', '( )학교발전기금 운용계획서'의 앞머리는
    // 골라 표시하는 빈 칸입니다. 이름의 일부가 아닙니다.
    .replace(/^\s*(?:\[\s*\]|\(\s*\))\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  name = cutAtLooseBracket(name).trim();
  // 맨 앞에 붙은 차례표·글머리표를 뗍니다. 겹쳐 붙기도 합니다('가) 1.').
  for (let round = 0; round < 3; round += 1) name = name.replace(ENUMERATOR, "").trim();
  name = name.replace(JOINER, "").replace(ORPHAN, "").trim();
  // 뒤에 붙은 부수('1부', '각 1부')와 빈 날짜칸('20 . . .')을 뗍니다.
  name = name
    .replace(/\s*(?:각\s*)?\d+\s*부$/, "")
    .replace(/\s*\d*\s*[.\s]*$/, "")
    .replace(/[\s,.·:;]+$/, "")
    .trim();
  // 이름 뒤의 딸림 설명이 이름보다 길면 뗍니다.
  //   '출산축하 복지점수 신청서(학교에서 포인트 조정 금지)' → 앞말만
  const tail = /^([^(（]{4,})[(（].*[)）]$/.exec(name);
  if (tail && [...name].length > 24) name = tail[1].trim();
  return name;
}

function captionOf(raw) {
  const firstTable = /<table>([\s\S]*?)<\/table>/.exec(raw);
  if (!firstTable) return "";
  const rows = firstTable[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows.slice(0, 5)) {
    const filled = (row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g) || [])
      .map((cell) => cell.replace(/^<t[hd][^>]*>/, "").replace(/<\/t[hd]>$/, ""))
      .map((cell) => cell.split(/<br\s*\/?>/i).map((piece) => cleanName(piece)).filter(Boolean))
      // '(앞 쪽)'처럼 쪽을 가리키는 칸은 글로 세지 않습니다.
      .filter((pieces) => pieces.some((piece) => !/^\(?\s*(?:앞|뒤)\s*쪽/.test(piece)));
    if (filled.length !== 1) continue;
    const pieces = filled[0];
    const titled = pieces.find((piece) => /^제\s*목[\s:]*\S/.test(piece));
    if (titled) {
      const name = titled.replace(/^제\s*목[\s:]*/, "").trim();
      if (name.length >= 3) return name;
    }
    const said = pieces.find((piece) => looksLikeDocName(piece));
    if (said) return said;
  }
  return "";
}

// 서식 파일에서 이름이 될 만한 줄을 좋은 것부터 모읍니다.
// 검색이 서식 안의 글자도 찾을 수 있게 글 전체도 함께 담아 둡니다.
function formText(chapterId, downloadPath, marker) {
  const empty = { text: "", subject: "", marked: "", caption: "", plain: "" };
  const source = path.join(docs, downloadPath);
  if (!existsSync(source)) return empty;
  mkdirSync(work, { recursive: true });
  const target = path.join(work, `${chapterId}-${path.basename(downloadPath, ".hwpx")}.md`);
  if (!existsSync(target)) {
    const failed = runKordoc([source, "-o", target, "--silent"]);
    if (failed || !existsSync(target)) return empty;
  }
  const raw = readFileSync(target, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim());

  // 1) 서식 파일 첫 줄은 대개 '[서식3] 출산축하 복지점수 신청서'입니다.
  //    번호 뒤에 적힌 말이 그 서식의 이름입니다.
  const kind = marker.slice(0, 2);
  const number = marker.slice(2);
  const head = new RegExp(`^\\[\\s*${kind}\\s*${number}\\s*\\]\\s*(\\S.*)$`);
  let marked = "";
  for (const line of lines.slice(0, 3)) {
    const found = head.exec(line);
    if (found) {
      marked = found[1];
      break;
    }
  }

  // 2) 예시 공문은 '제목' 칸에 무슨 문서인지 적혀 있습니다.
  //    머리 줄이라 <th>로 나오기도 하므로 둘 다 봅니다.
  const subject = /<t[hd][^>]*>\s*제\s*목\s*<\/t[hd]>\s*<t[hd][^>]*>([^<]{2,60})<\/t[hd]>/.exec(raw);

  // 3) 관공서 서식은 표 맨 위 한 칸에 제목을 크게 적어 둡니다.
  //    글이 든 칸이 그 줄에 하나뿐일 때가 제목 줄입니다.
  //
  //      <tr><th colspan="13">민원처리부</th></tr>
  //      <tr><td colspan="5"></td><td colspan="6">정보공개 처리대장</td><td>(앞 쪽)</td></tr>
  //
  //    통지서는 그 칸 안에 공문 머리를 통째로 적어 두기도 합니다.
  //    그때는 '제 목' 뒤에 적힌 말이 이름입니다.
  //
  //      행정기관명<br>수신자<br>(경유)<br>제 목 정보공개 청구사실 통지서
  const caption = captionOf(raw);

  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[|#*`]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  // 4) 표 밖에 홀로 적힌 제목 줄입니다('기준소득월액 적용 안내').
  //    문서의 제목은 맨 앞에 있습니다. 표가 시작되면 그 뒤는 채워 넣는 칸이고,
  //    한참 아래에서 주우면 붙임 목록의 한 줄을 이름으로 삼게 됩니다.
  //    그래서 첫 표 앞의 몇 줄만 봅니다.
  let plain = "";
  let looked = 0;
  for (const line of lines) {
    if (!line) continue;
    if (/^<t(?:able|r|d|h)\b/.test(line)) break;
    if (looked >= 6) break;
    looked += 1;
    const said = cleanName(line);
    if (looksLikeDocName(said)) {
      plain = said;
      break;
    }
  }

  return {
    text,
    subject: subject ? cleanName(subject[1]) : "",
    marked: cleanName(marked),
    caption,
    plain,
  };
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
      const raw = (before.match(/[가-힣A-Za-z0-9()（）〔〕··\s]+$/) || [""])[0]
        .split(/[\n•‣▸▹▶▪□○◦※]/)
        .pop()
        .replace(/^[\s,·]+/, "")
        .replace(/\s*(?:은|는|이|가|을|를|와|과|의|에|로|으로)$/, "")
        .trim();
      // 본문에서 딴 이름에만 앞말 떼기를 씁니다. 서식 파일에 적힌 이름은
      // 이미 이름이므로 건드리지 않습니다.
      // '…를 통하여 사업장 신고[서식5]'처럼 문장 한가운데가 잘려 온 것은
      // 첫 마디를 더 떼어 냅니다.
      const name = dropLeadWords(cleanName(raw)).trim().replace(MID_SENTENCE, "").trim();
      return { sectionId: section.id, title: name };
    }
  }
  return null;
}


// 서식 파일에 적힌 이름을 먼저 씁니다. 본문에서 딴 이름은 문장 조각이기 쉽습니다.
// 스물너덧 자를 넘으면 그것도 문장 조각으로 봅니다.
function pickTitle(found, referenced, marker) {
  // 서식 파일에서 딴 이름은 그 문서에 적힌 제목 그대로이므로 마흔 자까지 봅니다.
  // 본문에서 딴 이름은 문장을 자른 것이라 스물너덧 자를 넘으면 조각으로 봅니다.
  const own = (name) => (name && [...name].length <= 40 ? name : "");
  // 공문 제목은 길어도 그것이 그 문서의 이름입니다. 길이를 따지지 않습니다.
  const fits = (name) => (name && [...name].length <= 24 ? name : "");
  return (
    own(found.marked) ||
    found.subject ||
    own(found.plain) ||
    own(found.caption) ||
    fits(referenced) ||
    titleFromText(found.text, marker) ||
    found.marked ||
    referenced ||
    marker
  );
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

// 표 머리글 줄입니다. '신청자 성 명 직 급'처럼 한 글자짜리 칸 이름이
// 줄줄이 붙은 모양입니다. 이것을 이름으로 쓰면 어느 서식인지 알 수 없습니다.
function looksLikeHeaderRow(line) {
  // '[ ]'처럼 고르는 칸 표시는 낱말로 세지 않습니다. 세면
  // '안전관리책임자 [ ] 선임 신고서'가 머리글로 몰려 버립니다.
  const words = line.split(/\s+/).filter((word) => /[가-힣A-Za-z0-9]/.test(word));
  if (words.length < 3) return false;
  // '초 과 근 무 명 령 서'처럼 자간을 벌려 적은 제목은 머리글이 아닙니다.
  // 한글파일은 제목을 이렇게 적는 일이 많아, 이것을 머리글로 보면
  // 진짜 이름이 통째로 걸러집니다.
  if (words.every((word) => [...word].length === 1)) return false;
  // '검사대상기기관리자 [ ] 선 임 … 신고서'처럼 문서를 가리키는 말로 끝나면
  // 칸 이름을 늘어놓은 줄이 아니라 자간을 벌려 적은 제목입니다.
  if (DOC_TAIL.test(words[words.length - 1])) return false;
  // 머리글의 표시는 한 글자짜리 칸 이름이 여럿 섞여 있다는 것입니다.
  const ones = words.filter((word) => [...word].length === 1).length;
  return ones >= 3 && ones >= words.length - 2;
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
        // '■ 도시가스사업법 시행규칙 [별지 제20호 서식]'은 어느 법의 별지인지를
        // 밝히는 줄입니다. 서식 이름이 아닙니다.
        !/^[■□●【]/.test(line) &&
        !looksLikeHeaderRow(line) &&
        // '※ [ ] 에는 해당되는 곳에 √표를 합니다'는 채우는 법을 알려 주는 글입니다.
        !SENTENCE.test(line) &&
        !MID_SENTENCE.test(line) &&
        !line.split(/\s+/).every((word) => STAMP.has(word)) &&
        // '○ ○ ○ ○ 학 교'처럼 빈칸 표시뿐인 줄은 이름이 아닙니다.
        !/^[\s○□■●◇◆\-_]+$/.test(line.replace(/[가-힣A-Za-z0-9]/g, (c) => (/[학교]/.test(c) ? "" : c))) &&
        (line.match(/[가-힣]/g) || []).length >= 3
    );
  return cleanName(first || "") || marker;
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
    const found = formText(chapterId, asset.download, marker);
    const reference = findReference(data.sections, marker);
    if (reference && reference.title) named += 1;
    forms.push({
      id: marker,
      title: pickTitle(found, reference && reference.title, marker),
      sectionId: (reference && reference.sectionId) || guessSection(data.sections, found.text).id,
      content: found.text,
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
