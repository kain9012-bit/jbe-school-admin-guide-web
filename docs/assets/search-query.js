// 문장으로 물어도 결과가 나오는 검색 규칙입니다.
//
// 원문은 '기록물 이관'처럼 명사로 쓰여 있는데 이용자는 '기록물 이관은 어떻게 하나요'처럼
// 묻습니다. 조사가 붙으면 글자 그대로는 어긋나므로 뒤를 조금씩 떼어 낸 모양도 함께 봅니다.
//   이관은 → 이관   /  계산하나요 → 계산하나 → 계산하 → 계산
//
// 순위는 아래 네 가지로 매깁니다. 검색에서 널리 쓰는 BM25와 같은 생각입니다.
//   1. 흔한 말은 가볍게      '학교'는 어디에나 나오므로 순위를 가려 주지 못합니다
//   2. 여러 번 나오면 무겁게  단 한없이 오르지는 않게 눌러 줍니다
//   3. 짧은 글을 앞에         같은 횟수라면 짧은 글이 그 말을 더 다루고 있습니다
//   4. 낱말째로 맞아야 인정   '산업안전보건'에 든 '전보'는 '전보'를 찾는 것이 아닙니다
//
// 4번이 특히 중요합니다. 한글을 두 글자씩 끊어 맞추면 낱말 가운데를 스친 것까지
// 걸려 '전보'를 찾았는데 '산업안전보건 교육'이 1등으로 나옵니다.
(function () {
  "use strict";

  const normalize = (value) =>
    String(value ?? "").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();

  const HANGUL = /[가-힣]/;
  const LETTER = /[가-힣a-z0-9]/;

  // BM25에서 쓰는 값입니다. k1은 '여러 번 나올 때 얼마나 더 쳐 줄지',
  // b는 '긴 글을 얼마나 깎을지'를 뜻합니다. 검색에서 흔히 쓰는 값을 씁니다.
  const K1 = 1.2;
  const B = 0.6;
  // 글 길이의 바닥값입니다. 이보다 짧은 글도 이만큼인 것으로 쳐서,
  // 제목 한 줄짜리 칸이 실제 설명을 밀어내지 않게 합니다.
  const MIN_LENGTH = 60;

  // 낱말이 시작하는 자리에서 맞은 횟수를 셉니다.
  // 앞에 글자가 붙어 있으면 낱말 가운데를 스친 것이므로 세지 않습니다.
  //   '전보'  ○ '전보 발령'   × '산업안전보건'   ← 앞에 '안'이 붙어 있습니다
  //
  // 뒤는 나눠서 셉니다. 우리말은 낱말 뒤에 붙여 새 말을 만들기 때문입니다.
  //   '불용' → '불용품', '출장' → '출장비', '계약' → '계약서'
  // 뒤까지 딱 끝난 것(whole)이 가장 확실하고, 뒤에 말이 붙은 것(partial)은
  // 그다음입니다. 이 둘을 나누지 않으면 '불용 처분'을 찾았는데
  // '불용품의 처분'이 걸리지 않습니다.
  function countAt(haystack, needle) {
    if (!needle) return { whole: 0, partial: 0 };
    let whole = 0;
    let partial = 0;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      const before = at > 0 ? haystack[at - 1] : "";
      if (!LETTER.test(before)) {
        const after = haystack[at + needle.length] || "";
        if (LETTER.test(after)) partial += 1;
        else whole += 1;
      }
      at = haystack.indexOf(needle, at + 1);
    }
    return { whole, partial };
  }

  function countWhole(haystack, needle) {
    return countAt(haystack, needle).whole;
  }

  // 검색어를 낱말로 끊고, 낱말마다 견줄 모양을 만듭니다.
  //   forms  낱말째로 견줄 모양 (긴 것부터). 여기서 맞으면 '제대로 맞은 것'으로 봅니다.
  //   grams  두 글자 조각. 이것만 맞은 것은 순위를 조금 올려 줄 뿐,
  //          그것만으로 결과에 넣지는 않습니다.
  function tokenize(text) {
    const words = [];
    const runs = normalize(text).match(/[가-힣]+|[a-z0-9]+/g) || [];
    for (const run of runs) {
      if (!HANGUL.test(run)) {
        if (run.length < 2) continue;
        words.push({ word: run, forms: [run], grams: [] });
        continue;
      }
      if (run.length === 1) {
        words.push({ word: run, forms: [run], grams: [] });
        continue;
      }
      // 뒤를 한 글자씩 떼어 낸 모양을 함께 봅니다. 조사·어미가 붙어도 만납니다.
      // 다만 낱말의 열에 여섯은 남겨 둡니다. 더 떼면 뜻이 달라져
      // '성과상여금'을 찾았는데 '성과'만 스친 글이 나옵니다.
      const shortest = Math.max(2, Math.ceil(run.length * 0.6));
      const forms = [];
      for (let length = run.length; length >= shortest; length -= 1) {
        forms.push(run.slice(0, length));
      }
      const grams = [];
      for (let index = 0; index < run.length - 1; index += 1) {
        grams.push(run.slice(index, index + 2));
      }
      words.push({ word: run, forms, grams });
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

  // 자료 전체에서 그 모양이 몇 개의 글에 나오는지 세어 둡니다.
  // 흔할수록 값이 작아져 순위에 거의 보태지지 않습니다.
  function inverseFrequency(pool, value, whole) {
    let seen = 0;
    for (const doc of pool) {
      const hit = whole
        ? hitCount(doc.title, value) || hitCount(doc.text, value)
        : doc.title.includes(value) || doc.text.includes(value);
      if (hit) seen += 1;
    }
    const total = pool.length || 1;
    return { df: seen, idf: Math.log(1 + (total - seen + 0.5) / (seen + 0.5)) };
  }

  // 낱말 시작에서 맞은 만큼을 셉니다. 뒤에 말이 붙은 것은 조금 낮춰 셉니다.
  const PARTIAL = 0.55;
  function hitCount(haystack, needle) {
    const { whole, partial } = countAt(haystack, needle);
    return whole + partial * PARTIAL;
  }

  function saturate(tf, norm) {
    return (tf * (K1 + 1)) / (tf + K1 * norm);
  }

  function search(index, query, options) {
    const settings = options || {};
    const allowedTypes = settings.types;
    const limit = settings.limit || 30;

    const { phrases, excluded, rest } = parseQuery(query);
    const words = tokenize(rest);
    const wholeQuery = normalize(rest);

    const pool = [];
    let lengthSum = 0;
    for (const item of index) {
      if (allowedTypes && !allowedTypes.includes(item.type)) continue;
      const title = normalize(item.title);
      const text = normalize(item.text);
      lengthSum += text.length;
      pool.push({ item, title, text });
    }
    if (!pool.length) {
      return { phrases, excluded, wordCount: words.length, total: 0, results: [] };
    }
    const averageLength = lengthSum / pool.length || 1;

    // 낱말마다 '자료에 실제로 있는 모양'을 모두 남겨 둡니다. 긴 것부터 봅니다.
    // 하나만 남기면 안 됩니다. '출장비'는 자료에 한 곳뿐이라 그것만 남기면
    // 정작 '출장'을 다루는 글이 하나도 나오지 않습니다.
    // 긴 모양일수록 idf가 커서, 딱 맞는 글은 그대로 위에 옵니다.
    for (const entry of words) {
      entry.hits = [];
      for (const form of entry.forms) {
        const { df, idf } = inverseFrequency(pool, form, true);
        if (df) entry.hits.push({ value: form, idf, length: form.length });
      }
      entry.gramHits = entry.hits.length
        ? []
        : entry.grams.map((value) => ({
            value,
            idf: inverseFrequency(pool, value, false).idf,
          }));
    }

    const results = [];
    for (const doc of pool) {
      const { item, title, text } = doc;
      if (excluded.some((term) => text.includes(term) || title.includes(term))) continue;

      // 따옴표로 지정한 구문은 반드시 있어야 합니다.
      let missing = false;
      for (const phrase of phrases) {
        if (!text.includes(phrase) && !title.includes(phrase)) missing = true;
      }
      if (missing) continue;

      if (!words.length) {
        if (!phrases.length) continue;
        results.push({ item, score: 100, matched: phrases.length });
        continue;
      }

      // 아주 짧은 글이 무조건 위로 오지 않게 길이에 바닥을 둡니다.
      // '세부내용 3. 계약 시 구비서류'처럼 제목만 있는 칸이 실제 설명을 이깁니다.
      const effective = Math.max(text.length, MIN_LENGTH);
      const norm = 1 - B + (B * effective) / averageLength;
      let score = 0;
      let matched = 0;
      let weak = 0;

      for (const entry of words) {
        let best = 0;
        for (const hit of entry.hits) {
          const inTitle = hitCount(title, hit.value);
          const inText = hitCount(text, hit.value);
          if (!inTitle && !inText) continue;
          // 제목에 있으면 그 글이 바로 그 이야기입니다. 세 배로 칩니다.
          const tf = inText + inTitle * 3;
          best = Math.max(best, hit.length * hit.idf * saturate(tf, norm));
        }
        if (best) {
          score += best;
          matched += 1;
          continue;
        }
        // 낱말째로는 못 만났습니다. 두 글자 조각으로 스쳤는지만 봅니다.
        // 이것만으로는 결과에 넣지 않고, 순위를 조금 올려 주는 데만 씁니다.
        for (const gram of entry.gramHits) {
          if (title.includes(gram.value) || text.includes(gram.value)) {
            weak += gram.idf * 0.3;
          }
        }
      }

      // 낱말째로 하나도 못 맞춘 글은 내놓지 않습니다.
      // 이것이 없으면 '성과상여금'을 찾았는데 '성과'만 스친 글이 73건 나옵니다.
      if (!matched) continue;

      score += weak;
      // 검색어의 낱말을 몇 개나 맞췄는지가 가장 중요합니다.
      // 한 낱말을 여러 번 스친 글보다, 여러 낱말을 고루 맞춘 글이 찾는 글입니다.
      //   '물품 불용 처분' → '물품'만 잔뜩 든 글보다 셋 다 든 글이 위에 와야 합니다.
      score *= 0.35 + 0.65 * (matched / words.length);
      score *= 1 + (matched - 1) * 0.5;
      if (phrases.length) score += 60;
      // 검색어가 통째로 들어 있으면 가장 확실한 근거입니다.
      if (wholeQuery.length >= 4 && (title.includes(wholeQuery) || text.includes(wholeQuery))) {
        score += 40;
      }

      results.push({ item, score, matched });
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

  // 검색어가 나온 자리를 잘라 보여 줍니다. 결과가 왜 나왔는지 알 수 있어야 합니다.
  // 화면에 그대로 넣을 수 있도록 [맞은 곳, 아닌 곳]으로 나눠 돌려줍니다.
  function snippet(text, query, span) {
    const width = span || 150;
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) return [];
    const lower = source.toLocaleLowerCase("ko-KR");

    const { phrases, rest } = parseQuery(query);
    // 발췌에서는 낱말 가운데라도 표시합니다. '연가'를 찾았으면
    // '연가일수'에서도 어디가 맞았는지 보여 주는 편이 읽기 쉽습니다.
    const needles = [...phrases];
    for (const entry of tokenize(rest)) {
      for (const form of entry.forms) {
        if (lower.includes(form)) {
          needles.push(form);
          break;
        }
      }
    }
    if (!needles.length) {
      return [{ text: source.slice(0, width) + (source.length > width ? "…" : ""), hit: false }];
    }

    // 맞은 자리를 모읍니다.
    const spots = [];
    for (const needle of needles) {
      let at = lower.indexOf(needle);
      while (at !== -1) {
        spots.push([at, at + needle.length]);
        at = lower.indexOf(needle, at + needle.length);
      }
    }
    if (!spots.length) {
      return [{ text: source.slice(0, width) + (source.length > width ? "…" : ""), hit: false }];
    }
    spots.sort((a, b) => a[0] - b[0]);

    // 첫 자리를 가운데 두고 잘라 냅니다.
    const first = spots[0][0];
    let from = Math.max(0, first - Math.floor(width / 3));
    let to = Math.min(source.length, from + width);
    if (to - from < width) from = Math.max(0, to - width);

    const pieces = [];
    let cursor = from;
    for (const [start, end] of spots) {
      if (end <= from || start >= to) continue;
      if (start > cursor) pieces.push({ text: source.slice(cursor, start), hit: false });
      if (start >= cursor) pieces.push({ text: source.slice(start, Math.min(end, to)), hit: true });
      cursor = Math.max(cursor, Math.min(end, to));
    }
    if (cursor < to) pieces.push({ text: source.slice(cursor, to), hit: false });
    if (from > 0) pieces.unshift({ text: "…", hit: false });
    if (to < source.length) pieces.push({ text: "…", hit: false });
    return pieces;
  }

  // 결과를 업무별로 묶습니다.
  // 묶지 않으면 한 업무의 세부 항목이 첫 화면을 통째로 차지합니다.
  //   '연말정산' → 상위 5건이 모두 제7편 연말정산의 조각
  function groupByWork(results) {
    const groups = new Map();
    for (const entry of results) {
      const key = `${entry.item.chapterId || ""}/${entry.item.workId || entry.item.title}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, chapterId: entry.item.chapterId, hits: [], score: 0, work: null };
        groups.set(key, group);
      }
      if (entry.item.type === "업무") group.work = entry.item;
      else group.hits.push(entry);
      // 업무 자체가 걸리지 않아도 머리글은 업무 이름이어야 합니다.
      // 그러지 않으면 '육아휴직'을 찾았을 때 서식 이름이 묶음 제목이 됩니다.
      if (!group.label && entry.item.workTitle) {
        group.label = {
          chapterId: entry.item.chapterId,
          chapterLabel: entry.item.chapterLabel,
          chapterTitle: entry.item.chapterTitle,
          type: "업무",
          title: entry.item.workTitle,
          text: entry.item.workTitle,
          workId: entry.item.workId,
        };
      }
      // 묶음 점수는 가장 잘 맞은 것을 따르되, 여러 군데에서 나오면 조금 올립니다.
      group.score = Math.max(group.score, entry.score) + entry.score * 0.05;
    }
    const list = [...groups.values()];
    for (const group of list) {
      if (!group.work) group.work = group.label || (group.hits[0] && group.hits[0].item);
      group.hits.sort((a, b) => b.score - a.score);
    }
    return list.sort((a, b) => b.score - a.score);
  }

  window.GUIDE_SEARCH = {
    search,
    tokenize,
    parseQuery,
    normalize,
    snippet,
    countWhole,
    groupByWork,
  };
})();
