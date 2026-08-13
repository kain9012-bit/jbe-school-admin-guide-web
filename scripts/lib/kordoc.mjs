// kordoc을 부르는 한 가지 방법을 여기 모아 둡니다.
//
// node_modules/.bin/kordoc.cmd를 그대로 실행하면 윈도우에서 실패합니다.
// 요즘 Node는 보안 조치로 .cmd·.bat를 shell 없이 띄우지 못하게 막았고,
// 그때 stdout·stderr가 undefined로 와서 '무엇이 잘못됐는지'조차 안 보입니다.
// 그래서 설치된 자바스크립트 파일을 지금 돌고 있는 node로 직접 부릅니다.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "node_modules", "kordoc", "dist", "cli.js");

export const hasKordoc = () => existsSync(cli);

// 실패하면 왜 실패했는지 한 줄로 돌려줍니다. 빈 문자열이면 잘된 것입니다.
export function runKordoc(args) {
  if (!hasKordoc()) return "kordoc이 없습니다. npm install --omit=optional 로 설치하세요.";
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  if (result.error) return result.error.message;
  if (result.status !== 0) {
    return (result.stderr || result.stdout || `종료 코드 ${result.status}`).trim();
  }
  return "";
}
