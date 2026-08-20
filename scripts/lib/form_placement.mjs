// 서식이 어느 업무의 것인지 짐작합니다.
//
// 매뉴얼 본문이 '일상감사의뢰서[서식1]'처럼 서식 번호를 부르면 그 줄이 있는
// 업무가 답입니다. 그런데 편 뒤에 몰아 놓기만 하고 본문이 한 번도 부르지 않는
// 서식이 271개 가운데 130개쯤 됩니다. 그것은 글자를 보고 짐작해야 합니다.
//
// 예전에는 서식 파일의 글과 업무 본문에서 겹치는 낱말 수만 셌습니다.
// 그러면 글이 많은 업무가 늘 이깁니다. 어느 서식에나 나오는 '신청', '기관'
// 같은 낱말이 큰 업무에는 다 들어 있기 때문입니다.
//
//   서식2 가족복지점수 추가 배정 신청 서식 → 보수작업   (맞춤형복지여야 함)
//   서식7 채권압류 관리대장               → 보수작업   (채권압류여야 함)
//   서식5 초 과 근 무 명 령 서(제4편)     → 당직 및 비상근무 (초과근무여야 함)
//
// 세 가지를 함께 봅니다.
//   1. 서식 이름과 업무 이름이 몇 글자나 이어서 겹치는가
//      '채권압류 관리대장'과 '채권압류'는 네 글자가 이어집니다.
//   2. 서식 이름의 낱말이 그 업무 본문에 나오는가 (서식 글보다 여덟 배로 셉니다)
//   3. 서식 글의 낱말이 그 업무 본문에 나오는가
//
// 낱말마다 값을 다르게 줍니다. 여러 업무에 두루 나오는 낱말은 어느 업무인지
// 알려 주지 못하므로 나온 업무 수로 나눕니다. 이 한 가지가 큰 업무 쏠림을
// 없앱니다.
//
// 얼마나 맞는지는 본문이 부르는 서식 142개로 잽니다(정답을 아는 표본).
// 76.8% → 94.4%. scripts/validate_form_placement.js가 이 수치를 지킵니다.

const squash = (value) => String(value || "").replace(/\s+/g, "");

// 한 글자짜리 조각은 어느 글에나 있어 뜻이 없으므로 두 글자부터 셉니다.
const WORDS = /[가-힣]{2,}|[A-Za-z]{3,}/g;
const STOP = new Set([
  "경우", "관련", "규정", "사항", "내용", "기준", "처리", "해당",
  "학교", "교육", "업무", "작성", "제출",
]);

export const bagOf = (value) =>
  (String(value || "").match(WORDS) || []).filter((word) => !STOP.has(word));

// 두 글월에서 가장 길게 이어 겹치는 토막의 길이입니다.
export function longestShared(one, other) {
  let best = 0;
  for (let at = 0; at < one.length; at += 1) {
    for (let to = 0; to < other.length; to += 1) {
      let run = 0;
      while (at + run < one.length && to + run < other.length && one[at + run] === other[to + run]) {
        run += 1;
      }
      if (run > best) best = run;
    }
  }
  return best;
}

const NAME_WEIGHT = 1; // 업무 이름과 이어 겹치는 글자
const TITLE_WEIGHT = 8; // 서식 이름의 낱말
const HEAD_WEIGHT = 0.5; // 업무 이름 + 소제목과 이어 겹치는 글자

// 낱말이 어느 업무에 몇 번 나오는지는 편마다 한 번만 세면 됩니다.
export function sectionScales(sections) {
  const corpora = sections.map(
    (section) =>
      new Set(
        bagOf(
          `${section.title} ` +
            (section.contentBlocks || []).map((block) => `${block.title} ${block.body}`).join(" ")
        )
      )
  );
  const heads = sections.map((section) =>
    squash(`${section.title} ` + (section.contentBlocks || []).map((block) => block.title).join(" "))
  );
  const spread = new Map();
  for (const corpus of corpora) {
    for (const word of corpus) spread.set(word, (spread.get(word) || 0) + 1);
  }
  return { corpora, heads, spread };
}

export function guessSection(sections, form, scales = sectionScales(sections)) {
  const { corpora, heads, spread } = scales;
  const asked = [...new Set(bagOf(form.content).slice(0, 400))];
  const named = [...new Set(bagOf(form.title))];
  const title = squash(form.title);
  let best = 0;
  let top = -Infinity;
  sections.forEach((section, at) => {
    let score = 0;
    for (const word of asked) if (corpora[at].has(word)) score += 1 / (spread.get(word) || 1);
    for (const word of named) if (corpora[at].has(word)) score += TITLE_WEIGHT / (spread.get(word) || 1);
    score += NAME_WEIGHT * longestShared(title, squash(section.title));
    score += HEAD_WEIGHT * longestShared(title, heads[at]);
    if (score > top) {
      top = score;
      best = at;
    }
  });
  return sections[best];
}
