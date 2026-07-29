window.GUIDE_CONFIG = {
  defaultChapter: "01",
  chapters: [
    {
      id: "01",
      number: 1,
      label: "제1편",
      title: "행정업무 및 보안",
      available: true,
      dataScript: "assets/chapter1-data.js",
      stepsScript: "assets/chapter1-steps.js",
      dataGlobal: "CHAPTER1_DATA",
      stepsGlobal: "CHAPTER1_STEPS"
    },
    ...Array.from({ length: 18 }, (_, index) => {
      const number = index + 2;
      return {
        id: String(number).padStart(2, "0"),
        number,
        label: `제${number}편`,
        title: "",
        available: false,
        dataScript: `assets/chapter${number}-data.js`,
        stepsScript: `assets/chapter${number}-steps.js`,
        dataGlobal: `CHAPTER${number}_DATA`,
        stepsGlobal: `CHAPTER${number}_STEPS`
      };
    })
  ]
};
