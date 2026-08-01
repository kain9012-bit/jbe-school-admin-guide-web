// 검증을 한 번에 다 돌립니다.
//
//   node scripts/run_all_validations.mjs
//
// kordoc 대조 검증은 kordoc이 설치돼 있어야 돕니다.
//   npm install --omit=optional
// 설치돼 있지 않으면 '건너뜀'으로 표시하고, 다른 검증 결과는 그대로 알려 줍니다.

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = path.join(root, "scripts");

const jobs = readdirSync(scripts)
  .filter((name) => /^validate_.*\.(js|mjs|py)$/.test(name))
  .sort();

const hasKordoc = existsSync(path.join(root, "node_modules/kordoc"));
let failed = 0;
let skipped = 0;

for (const name of jobs) {
  if (name === "validate_source_against_kordoc.mjs" && !hasKordoc) {
    console.log(`${name.padEnd(40)} 건너뜀 (npm install --omit=optional 필요)`);
    skipped += 1;
    continue;
  }
  const runner = name.endsWith(".py") ? "python3" : "node";
  const result = spawnSync(runner, [path.join(scripts, name)], {
    cwd: root,
    encoding: "utf8",
  });
  const ok = result.status === 0;
  console.log(`${name.padEnd(40)} ${ok ? "통과" : "실패"}`);
  if (!ok) {
    failed += 1;
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim().split("\n");
    detail.slice(0, 6).forEach((line) => console.log(`    ${line}`));
  }
}

console.log(
  `\n검증 ${jobs.length}개 중 통과 ${jobs.length - failed - skipped}개` +
    (skipped ? ` · 건너뜀 ${skipped}개` : "") +
    (failed ? ` · 실패 ${failed}개` : "")
);
process.exit(failed ? 1 : 0);
