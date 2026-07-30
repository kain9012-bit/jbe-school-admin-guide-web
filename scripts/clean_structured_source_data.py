from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
FLOW_TITLE = "업무 흐름도"
SOURCE_FLOW = re.compile(r"^\s*[^▶\n]+\s*▶")


def load(chapter: int) -> dict:
    path = ASSETS / f"chapter{chapter}-data.js"
    prefix = f"window.CHAPTER{chapter}_DATA = "
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw.removeprefix(prefix).removesuffix(";\n"))


def save(chapter: int, data: dict) -> None:
    path = ASSETS / f"chapter{chapter}-data.js"
    path.write_text(
        f"window.CHAPTER{chapter}_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def clean(chapter: int) -> None:
    data = load(chapter)
    steps: dict[str, list[dict[str, object]]] = {}

    for section in data["sections"]:
        exact_flows = []
        for block in section["contentBlocks"]:
            block.pop("flowStep", None)
            if (
                block["title"] == FLOW_TITLE
                and SOURCE_FLOW.match(str(block.get("body", "")))
            ):
                exact_flows.append(
                    {
                        "sourceText": block["body"],
                        "pdfPage": block["pdfPage"],
                        "printedPage": block["printedPage"],
                    }
                )
        section["flowGroups"] = exact_flows
        steps[section["id"]] = exact_flows

    save(chapter, data)
    steps_path = ASSETS / f"chapter{chapter}-steps.js"
    steps_path.write_text(
        f"window.CHAPTER{chapter}_STEPS = "
        + json.dumps(steps, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"제{chapter}편: 자동 추정 연결 제거, "
        f"원문 흐름 {sum(len(value) for value in steps.values())}개 보존"
    )


def main() -> None:
    clean(1)
    clean(3)


if __name__ == "__main__":
    main()
