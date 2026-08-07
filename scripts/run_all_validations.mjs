// 검증을 한 번에 다 돌립니다.
//
//   node scripts/run_all_validations.mjs
//
// kordoc 대조 검증은 kordoc이 설치돼 있어야 돕니다.
//   npm install --omit=optional        (윈도우 PowerShell에서는 npm.cmd install --omit=optional)
// 설치돼 있지 않으면 '건너뜀'으로 표시하고, 다른 검증 결과는 그대로 알려 줍니다.

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = path.join(root, "scripts");

// 파이썬을 부르는 이름은 컴퓨터마다 다릅니다.
// 리눅스·맥은 python3, 윈도우는 python 또는 py 입니다.
// 특히 윈도우에는 파이썬이 없어도 'python3'라는 이름만 있는 바로가기가 있어서,
// 실행하면 마이크로소프트 스토어를 열고 아무것도 하지 않습니다.
// 그래서 이름만 보지 않고 실제로 '--version'을 물어봐서 대답하는 것을 씁니다.
function findPython() {
  const candidates =
    process.platform === "win32"
      ? [["py", ["-3"]], ["python", []], ["python3", []]]
      : [["python3", []], ["python", []]];
  for (const [command, prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, "--version"], { encoding: "utf8" });
    const said = `${probe.stdout || ""}${probe.stderr || ""}`;
    if (probe.status === 0 && /^Python 3/.test(said.trim())) return { command, prefix };
  }
  return null;
}

const python = findPython();

const jobs = readdirSync(scripts)
  .filter((name) => /^validate_.*\.(js|mjs|py)$/.test(name))
  .sort();

const hasKordoc = existsSync(path.join(root, "node_modules/kordoc"));
let failed = 0;
let skipped = 0;

const installHint =
  process.platform === "win32"
    ? "npm.cmd install --omit=optional 필요 (PowerShell은 npm 대신 npm.cmd)"
    : "npm install --omit=optional 필요";

for (const name of jobs) {
  if (name === "validate_source_against_kordoc.mjs" && !hasKordoc) {
    console.log(`${name.padEnd(40)} 건너뜀 (${installHint})`);
    skipped += 1;
    continue;
  }
  // 표가 폭 안에 들어가는지 보는 검증은 브라우저와 로컬 서버가 필요합니다.
  if (name === "validate_table_fit.mjs" && !existsSync(path.join(root, "node_modules/playwright"))) {
    console.log(`${name.padEnd(40)} 건너뜀 (playwright 필요)`);
    skipped += 1;
    continue;
  }
  if (name.endsWith(".py") && !python) {
    console.log(`${name.padEnd(40)} 건너뜀 (파이썬 3을 찾지 못했습니다)`);
    skipped += 1;
    continue;
  }
  const runner = name.endsWith(".py") ? python.command : "node";
  const args = name.endsWith(".py")
    ? [...python.prefix, path.join(scripts, name)]
    : [path.join(scripts, name)];
  const result = spawnSync(runner, args, {
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
