// 편별 통합 서식 한글파일을 SVG 한 장으로 그려 둡니다.
// build_form_assets.py가 이 SVG를 쪽 단위로 잘라 서식별 미리보기를 만듭니다.
//
// 사용법: node scripts/render_form_svgs.mjs

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasKordoc, runKordoc } from "./lib/kordoc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const downloads = path.join(root, "docs", "downloads");
const out = path.join(root, "tmp");
mkdirSync(out, { recursive: true });

if (!hasKordoc()) {
  console.log("kordoc이 없어 건너뜁니다. npm install --omit=optional");
  process.exit(0);
}

const sources = readdirSync(downloads)
  .filter((name) => /^chapter\d+-forms\.hwpx$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

let drawn = 0;
for (const name of sources) {
  const chapter = name.match(/\d+/)[0];
  const target = path.join(out, `chapter${chapter}-forms-kordoc.svg`);
  if (existsSync(target)) continue;
  const failed = runKordoc(["render", path.join(downloads, name), "-o", target, "--silent"]);
  if (failed || !existsSync(target)) {
    console.error(`제${chapter}편 서식을 그리지 못했습니다: ${failed || "결과 파일이 생기지 않았습니다"}`);
    process.exit(1);
  }
  drawn += 1;
  console.log(`제${chapter}편 서식 그림 완성`);
}

console.log(`통합 서식 그림 ${drawn}개 새로 만듦 (이미 있는 것은 그대로 둠)`);
