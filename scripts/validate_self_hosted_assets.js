// 화면 자산이 모두 저장소 안에 있는지 확인합니다.
// 내부망이나 외부 접속이 막힌 환경에서도 화면이 온전히 보여야 합니다.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const problems = [];

function walk(dir, filter) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, filter));
    else if (filter(entry.name)) found.push(full);
  }
  return found;
}

// 1. 스타일·스크립트가 외부 서버에서 자산을 불러오지 않아야 합니다.
const assetFiles = walk(docs, (name) => /\.(css|js)$/.test(name));
const remoteAssetPattern = /url\(\s*["']?(https?:)?\/\/[^)"']+/gi;

for (const file of assetFiles) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.match(remoteAssetPattern) || [];
  for (const match of matches) {
    problems.push(`${path.relative(root, file)}: 외부 자산 참조 ${match.slice(0, 80)}`);
  }
}

// 2. HTML이 외부 스타일·스크립트·글꼴을 불러오지 않아야 합니다.
const htmlFiles = walk(docs, (name) => name.endsWith(".html"));
const remoteTagPattern = /<(?:link|script)[^>]*(?:href|src)\s*=\s*["'](https?:)?\/\/[^"']+["'][^>]*>/gi;

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.match(remoteTagPattern) || [];
  for (const match of matches) {
    problems.push(`${path.relative(root, file)}: 외부 자원 태그 ${match.slice(0, 80)}`);
  }
}

// 3. CSS가 가리키는 이미지 파일이 실제로 저장소에 있어야 합니다.
let checkedImages = 0;
for (const file of assetFiles.filter((name) => name.endsWith(".css"))) {
  const source = fs.readFileSync(file, "utf8");
  const urls = [...source.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/gi)].map((m) => m[1]);
  for (const url of urls) {
    if (url.startsWith("data:") || url.startsWith("http")) continue;
    const target = path.resolve(path.dirname(file), url.split("?")[0].split("#")[0]);
    checkedImages += 1;
    if (!fs.existsSync(target)) {
      problems.push(`${path.relative(root, file)}: 없는 파일 참조 ${url}`);
    }
  }
}

if (problems.length) {
  console.error("자체 호스팅 점검 실패:");
  [...new Set(problems)].forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}

console.log(
  `self-hosted assets valid: ${assetFiles.length} css/js, ${htmlFiles.length} html, ${checkedImages} url() 참조 확인`
);
