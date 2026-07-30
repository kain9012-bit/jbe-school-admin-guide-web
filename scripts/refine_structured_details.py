from pathlib import Path


path = Path(__file__).resolve().parents[1] / "docs" / "assets" / "structured-details.js"
source = path.read_text(encoding="utf-8")

schema_anchor = """    {
      test: (body) =>
        body.includes("지방공무원 임용령 제2조") &&
"""
single_lookup_schema = """    {
      test: (body) =>
        body.includes("아동·청소년 관련기관 취업제한") &&
        body.includes("성범죄 경력 및 아동학대 관련 범죄 전력"),
      caption: "성범죄·아동학대 관련 범죄 전력 조회",
      summary: "범죄 전력 조회 기준 표로 보기",
      rows: ["목적", "대상", "관련기관", "방법", "관련서류"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("지방공무원 임용령 제2조") &&
"""
if schema_anchor not in source:
    raise SystemExit("single lookup schema anchor not found")
source = source.replace(schema_anchor, single_lookup_schema, 1)

old_subject = """    if (!subject || subject.length > 32) subject = "이 항목";
"""
new_subject = """    if (
      !subject ||
      subject.length > 32 ||
      /^(?:TIPTIP|업무 흐름도|관련법규 및 참고자료)$/.test(subject)
    ) {
      subject = "";
    }
"""
if old_subject not in source:
    raise SystemExit("summary subject target not found")
source = source.replace(old_subject, new_subject, 1)

old_summary = """    if (hasConditions) return `${subject} 조건·예외 보기`;
    if (hasItems) return `${subject} 항목별 내용 보기`;
    return `${subject} 전체 내용 보기`;
"""
new_summary = """    if (hasConditions) {
      return subject ? `${subject} 조건·예외 보기` : "조건·예외와 세부 기준 보기";
    }
    if (hasItems) return subject ? `${subject} 항목별 내용 보기` : "항목별 세부 내용 보기";
    return subject ? `${subject} 전체 내용 보기` : "전체 내용 보기";
"""
if old_summary not in source:
    raise SystemExit("summary output target not found")
source = source.replace(old_summary, new_summary, 1)

path.write_text(source, encoding="utf-8")
