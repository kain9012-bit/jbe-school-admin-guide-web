// 서식이 알맞은 업무에 붙었는지 확인합니다.
//
// 매뉴얼 본문이 '일상감사의뢰서[서식1]'처럼 서식 번호를 부르면 그 줄이 있는
// 업무가 답입니다. 그런 서식은 답을 알고 붙이므로 틀릴 일이 없습니다.
// 문제는 본문이 한 번도 부르지 않는 서식입니다. 그것은 글자를 보고 짐작하는데,
// 짐작이 나쁘면 이렇게 됩니다.
//
//   서식2 가족복지점수 추가 배정 신청 서식 → 보수작업 (맞춤형복지여야 함)
//
// 짐작이 얼마나 맞는지는 잴 수 있습니다. 본문이 부르는 서식은 답을 아니까,
// 그 답을 가리고 짐작만 시켜 본 뒤 몇 개나 맞히는지 세면 됩니다.
// 짐작 규칙(scripts/lib/form_placement.mjs)을 고쳤을 때 나빠지면 여기서 걸립니다.
//
//   낱말 겹침 수만 세던 예전 규칙  76.8%
//   이름을 함께 보는 지금 규칙     94.4%
//
// 사용법: node scripts/validate_form_placement.mjs

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guessSection, sectionScales } from "./lib/form_placement.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "docs", "assets");

// 이 아래로 떨어지면 짐작이 나빠진 것입니다. 잰 값 94.4%에서 조금 여유를 둡니다.
const FLOOR = 0.9;

const problems = [];
const misses = [];
let right = 0;
let total = 0;

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!existsSync(file)) continue;
  const box = {};
  new Function("window", readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  const label = `제${String(id).padStart(2, "0")}편`;
  const sections = data.sections || [];
  const byId = new Map(sections.map((section) => [section.id, section]));

  // 붙은 자리가 이 편에 있는 업무인지부터 봅니다.
  for (const form of data.forms || []) {
    if (!byId.has(form.sectionId)) {
      problems.push(`${label} ${form.id}: 없는 업무 '${form.sectionId}'에 붙었습니다.`);
    }
  }
  // 업무의 서식 목록과 서식의 업무 표시가 서로 어긋나면 화면에서 사라집니다.
  for (const section of sections) {
    for (const marker of section.formIds || []) {
      const form = (data.forms || []).find((item) => item.id === marker);
      if (!form) {
        problems.push(`${label} ${section.title}: 없는 서식 '${marker}'를 가리킵니다.`);
      } else if (form.sectionId !== section.id) {
        problems.push(
          `${label} ${section.title}: '${marker}'를 가리키는데 그 서식은 다른 업무 소속입니다.`
        );
      }
    }
  }

  if (sections.length < 2) continue;
  const scales = sectionScales(sections);
  for (const form of data.forms || []) {
    // 본문이 이 서식을 부른 자리가 답입니다.
    let truth = null;
    for (const section of sections) {
      for (const block of section.contentBlocks || []) {
        if (String(block.body || "").includes(`[${form.id}]`)) {
          truth = section;
          break;
        }
      }
      if (truth) break;
    }
    if (!truth) continue;
    total += 1;
    const guess = guessSection(sections, form, scales);
    if (guess.id === truth.id) right += 1;
    else {
      misses.push(
        `${label} ${form.id} ${String(form.title).slice(0, 22)} | ${truth.title} → ${guess.title}`
      );
    }
  }
}

const rate = total ? right / total : 1;
if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n서식이 잘못 이어진 자리 ${problems.length}곳`);
  process.exit(1);
}
if (rate < FLOOR) {
  misses.slice(0, 20).forEach((line) => console.error(`  ✗ ${line}`));
  console.error(
    `\n답을 아는 서식 ${total}개 중 ${right}개만 맞혔습니다 ` +
      `(${(rate * 100).toFixed(1)}%, ${(FLOOR * 100).toFixed(0)}% 이상이어야 합니다).`
  );
  process.exit(1);
}
console.log(
  `서식 붙임 자리 이상 없음 · 짐작 정확도 ${right}/${total} (${(rate * 100).toFixed(1)}%)`
);
