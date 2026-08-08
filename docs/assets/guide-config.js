window.GUIDE_CONFIG = {
  defaultChapter: "01",
  officialBoardUrl:
    "https://www.jbe.go.kr/board/list.jbe?boardId=BBS_0000085&menuCd=DOM_000000106002002000&contentsSid=336",
  chapters: (() => {
    const titles = {
      1: "행정업무 및 보안",
      2: "민원 및 정보공개",
      3: "인사관리",
      4: "복무",
      5: "감사",
      6: "학교발전기금 및 세입세출외현금",
      7: "공무원 보수",
      8: "교육공무직원",
      9: "학교급식",
      10: "학교운영위원회",
      11: "재산관리",
      12: "물품관리",
      13: "학교시설관리",
      14: "학교회계 예결산",
      15: "학교회계 수입",
      16: "학교회계 지출",
      17: "학교회계 계약",
      18: "신설학교 설립 및 개교",
      19: "학교폐지 및 통폐합",
    };
    // 19편 모두 매뉴얼 한글파일에서 만들어 공개합니다.
    const available = new Set(Array.from({ length: 19 }, (_, index) => index + 1));

    return Array.from({ length: 19 }, (_, index) => {
      const number = index + 1;
      return {
        id: String(number).padStart(2, "0"),
        number,
        label: `제${number}편`,
        title: titles[number],
        available: available.has(number),
        dataScript: `assets/chapter${number}-data.js`,
        stepsScript: `assets/chapter${number}-steps.js`,
        dataGlobal: `CHAPTER${number}_DATA`,
        stepsGlobal: `CHAPTER${number}_STEPS`,
      };
    });
  })(),
};
