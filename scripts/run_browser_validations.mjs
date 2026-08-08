// 브라우저를 띄워 보는 검증 두 가지를 편을 나눠 차례로 돌립니다.
//
//   · validate_render_smoke.mjs  업무 121개를 다 열어 보고 오류·빈칸·넘침 확인
//   · validate_table_fit.mjs     표가 폭 안에 들어가고 낱말이 안 끊기는지 확인
//
// 19편을 한 번에 열면 오래 걸려 중간에 끊깁니다. 그래서 몇 편씩 나눠 돌립니다.
//
// 사용법: node scripts/run_browser_validations.mjs

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUPS = [
  "01,02,03",
  "04,05,06,07",
  "08,09,10,11",
  "12,13,14",
  "15,16,17",
  "18,19",
];

let failed = 0;

// 편을 나눌 필요 없이 한 번만 돌면 되는 것들입니다.
for (const job of ["validate_card_heights.mjs", "validate_download_links.mjs"]) {
  const result = spawnSync("node", [path.join(root, "scripts", job)], {
    cwd: root,
    encoding: "utf8",
  });
  const ok = result.status === 0;
  console.log(`${job.padEnd(28)} 전체      ${ok ? "통과" : "실패"}`);
  if (!ok) {
    failed += 1;
    `${result.stdout || ""}${result.stderr || ""}`
      .trim()
      .split("\n")
      .slice(0, 8)
      .forEach((line) => console.log(`    ${line}`));
  }
}

for (const job of ["validate_render_smoke.mjs", "validate_table_fit.mjs"]) {
  for (const chapters of GROUPS) {
    const result = spawnSync(
      "node",
      [path.join(root, "scripts", job), "--chapters", chapters],
      { cwd: root, encoding: "utf8" }
    );
    const ok = result.status === 0;
    console.log(`${job.padEnd(28)} 제${chapters}편  ${ok ? "통과" : "실패"}`);
    if (!ok) {
      failed += 1;
      `${result.stdout || ""}${result.stderr || ""}`
        .trim()
        .split("\n")
        .slice(0, 8)
        .forEach((line) => console.log(`    ${line}`));
    }
  }
}

console.log(failed ? `\n실패 ${failed}건` : "\n브라우저 검증 모두 통과");
process.exit(failed ? 1 : 0);
