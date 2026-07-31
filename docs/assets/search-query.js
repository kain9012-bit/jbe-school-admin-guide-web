// 문장으로 물어도 결과가 나오는 검색 규칙입니다.
//
// 원문은 '기록물 이관'처럼 명사로 쓰여 있는데 이용자는 '기록물 이관은 어떻게 하나요'처럼
// 묻습니다. 조사가 붙으면 글자 그대로는 어긋나므로, 검색어를 글자 두 개씩 끊어 견줍니다.
//   기록물 이관은 → 기록, 록물, 물이, 이관, 관은
// '이관'이 그대로 남아 원문과 만납니다. 조사 목록을 따로 관리하지 않아도 되고
// 새로운 낱말에도 그대로 통합니다. Lucene의 CJK 분석기가 쓰는 방식과 같습니다.
//
// 낱말이 몇 개나 맞았는지로 순위를 매기므로, 물음말('언제', '어떻게')처럼
// 원문에 없는 말은 점수에 보태지지 않고 자연히 걸러집니다.
(function () {
  "use strict";

  const normalize = (value) =>
    String(value ?? "").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();

  const HANGUL = /[가-힣]/;

  // 한글은 두 글자씩, 영문·숫자는 낱말 그대로 씁니다.
  // 영문을 두 글자씩 끊으면 'pdf'가 'pd','df'가 되어 엉뚱한 것과 만납니다.
  //
  // 두 글자 조각과 함께 낱말 전체도 남깁니다.
  // '공문서'가 통째로 들어 있는 글을 '공문'만 스친 글보다 위에 올리기 위해서입니다.
  // weight는 그 조각이 맞았을 때 얼마나 크게 칠지를 뜻합니다.
  // 낱말 단위로 묶어 돌려줍니다.
  // '이관은' 한 낱말이 여러 조각으로 나뉘더라도 하나로 세어야
  // 낱말 몇 개를 맞췄는지 제대로 판단할 수 있습니다.
  function tokenize(text) {
    const words = [];
    const runs = normalize(text).match(/[가-힣]+|[a-z0-9]+/g) || [];
    for (const run of runs) {
      const tokens = new Map();
      const add = (value, weight) => {
        if (value) tokens.set(value, Math.max(tokens.get(value) || 0, weight));
      };

      if (!HANGUL.test(run)) {
        if (run.length < 2) continue;
        add(run, 3);
      } else if (run.length === 1) {
        add(run, 1);
      } else {
        // 낱말 전체는 조각보다 훨씬 확실한 근거입니다.
        add(run, 3);
        for (let index = 0; index < run.length - 1; index += 1) {
          add(run.slice(index, index + 2), 1);
        }
      }

      if (tokens.size) {
        words.push({
          word: run,
          tokens: [...tokens].map(([value, weight]) => ({ value, weight })),
        });
      }
    }
    return words;
  }

  // 따옴표로 묶은 부분은 그 순서 그대로 있어야 하고,
  // 앞에 빼기표를 붙인 낱말은 들어 있으면 결과에서 뺍니다.
  function parseQuery(query) {
    const phrases = [];
    const excluded = [];
    let rest = String(query ?? "");

    rest = rest.replace(/"([^"]+)"|“([^”]+)”/g, (match, a, b) => {
      const phrase = normalize(a || b);
      if (phrase) phrases.push(phrase);
      return " ";
    });

    rest = rest.replace(/(^|\s)-([^\s]+)/g, (match, space, word) => {
      const term = normalize(word);
      if (term) excluded.push(term);
      return " ";
    });

    return { phrases, excluded, rest: rest.trim() };
  }

  function scoreItem(fields, words, phrases, wholeQuery) {
    const { title, text } = fields;

    // 따옴표로 지정한 구문은 반드시 있어야 합니다.
    for (const phrase of phrases) {
      if (!text.includes(phrase) && !title.includes(phrase)) return null;
    }

    if (!words.length) {
      // 따옴표 구문만 입력한 경우입니다.
      return phrases.length ? { score: 100, matched: phrases.length } : null;
    }

    let matched = 0;
    let score = 0;
    for (const entry of words) {
      let best = 0;
      let meaningful = false;
      for (const token of entry.tokens) {
        const inTitle = title.includes(token.value);
        const inText = inTitle || text.includes(token.value);
        if (!inText) continue;
        // rarity는 자료에서 그 조각이 얼마나 드문지를 뜻합니다.
        // 어디에나 나오는 조각은 값이 0에 가까워 점수에 거의 보태지지 않습니다.
        best = Math.max(best, token.weight * token.rarity * (inTitle ? 4 : 1));
        if (token.rarity > 0.2) meaningful = true;
      }
      if (!best) continue;
      // 흔한 조각만 스친 낱말은 맞춘 것으로 세지 않습니다.
      if (meaningful) matched += 1;
      score += best;
    }
    if (!matched) return null;

    // 많이 맞을수록 크게 올리고, 입력한 문장이 통째로 있으면 가장 위로 보냅니다.
    score += matched * matched;
    if (phrases.length) score += 60;
    if (wholeQuery.length >= 4 && text.includes(wholeQuery)) score += 80;
    return { score, matched };
  }

  function search(index, query, options) {
    const settings = options || {};
    const allowedTypes = settings.types;
    const limit = settings.limit || 30;

    const { phrases, excluded, rest } = parseQuery(query);
    const words = tokenize(rest);
    const wholeQuery = normalize(rest);

    const pool = [];
    for (const item of index) {
      if (allowedTypes && !allowedTypes.includes(item.type)) continue;
      pool.push({
        item,
        title: normalize(item.title),
        text: normalize(item.text),
      });
    }

    // '언제', '하나요'처럼 어디에나 나오는 말은 어느 글이 맞는지 가려 주지 못합니다.
    // 불용어 목록을 손으로 관리하는 대신, 조각마다 자료에 몇 번 나오는지 세어
    // 흔할수록 가볍게 칩니다. 검색에서 널리 쓰는 방식입니다.
    const frequency = new Map();
    for (const entry of words) {
      for (const token of entry.tokens) {
        if (frequency.has(token.value)) continue;
        frequency.set(
          token.value,
          pool.filter((doc) => doc.title.includes(token.value) || doc.text.includes(token.value))
            .length
        );
      }
    }
    const total = pool.length || 1;
    for (const entry of words) {
      for (const token of entry.tokens) {
        const ratio = (frequency.get(token.value) || 0) / total;
        token.rarity = Math.max(0, 1 - ratio);
      }
    }

    // 낱말 개수로 자르지 않습니다. '사무인계인수는 언제 하나요'처럼
    // 뜻이 한 낱말에만 담긴 물음이 많기 때문입니다.
    // 대신 흔한 조각만 스친 결과는 점수가 낮아 아래로 밀립니다.
    const minMatched = words.length ? 1 : 0;

    const results = [];
    for (const doc of pool) {
      const { item, title, text } = doc;
      if (excluded.some((term) => text.includes(term) || title.includes(term))) continue;

      const scored = scoreItem({ title, text }, words, phrases, wholeQuery);
      if (!scored || scored.matched < minMatched) continue;
      results.push({ item, score: scored.score, matched: scored.matched });
    }

    results.sort(
      (a, b) =>
        b.score - a.score ||
        b.matched - a.matched ||
        a.item.title.localeCompare(b.item.title, "ko")
    );

    return {
      phrases,
      excluded,
      wordCount: words.length,
      total: results.length,
      results: results.slice(0, limit),
    };
  }

  window.GUIDE_SEARCH = { search, tokenize, parseQuery, normalize };
})();
