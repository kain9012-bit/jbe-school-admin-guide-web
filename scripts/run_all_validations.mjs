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
const BROWSER_JOBS = new Set([
  "validate_render_smoke.mjs",
  "validate_table_fit.mjs",
  "validate_card_heights.mjs",
  "validate_download_links.mjs",
  "validate_navigation.mjs",
  "validate_nested_tables.mjs",
]);
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
  // 브라우저를 띄워 보는 검증은 업무 121개를 실제로 열어야 해서 오래 걸립니다.
  // 여기서 같이 돌리면 중간에 끊겨 '실패'로 보이므로 따로 돌립니다.
  //   node scripts/validate_render_smoke.mjs --chapters 01,02,03
  //   node scripts/validate_table_fit.mjs    --chapters 01,02,03
  if (BROWSER_JOBS.has(name)) {
    console.log(`${name.padEnd(40)} 건너뜀 (따로 돌립니다: --chapters 로 편을 나눠서)`);
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
