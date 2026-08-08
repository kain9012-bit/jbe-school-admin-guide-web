// 자산 주소에 붙은 번호가 실제 파일과 맞는지 확인합니다.
//
// 번호가 없거나 옛 번호가 남아 있으면, 고친 것을 올려도 이용자 브라우저는
// 예전에 받아 둔 파일을 그대로 씁니다. 화면은 안 바뀌는데 코드는 맞으니
// 원인을 찾기가 아주 어렵습니다. 그래서 기계로 봅니다.
//
// 고친 뒤에는 이렇게 다시 붙입니다: node scripts/stamp_asset_versions.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const problems = [];

function hashOf(relativePath) {
  const file = path.join(docs, relativePath);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}

const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
let checked = 0;

for (const match of html.matchAll(
  /(?:href|src)="((?:assets|vendor)\/[^"?]+)(\?v=([0-9a-z-]+))?"/gi
)) {
  const [, url, , version] = match;
  const hash = hashOf(url);
  if (!hash) {
    problems.push(`index.html이 없는 파일을 부릅니다: ${url}`);
    continue;
  }
  checked += 1;
  if (!version) {
    problems.push(`${url}에 번호가 없습니다. 브라우저가 옛 파일을 계속 씁니다.`);
  } else if (version !== hash) {
    problems.push(`${url}의 번호가 옛것입니다 (${version} → ${hash}).`);
  }
}

// 나중에 불러오는 파일도 번호표에 있어야 합니다.
const table = {};
new Function("window", fs.readFileSync(path.join(docs, "assets/asset-versions.js"), "utf8"))(
  table
);
const versions = table.GUIDE_ASSET_VERSIONS || {};

const lateLoaded = [
  "assets/global-home.js",
  "assets/app-faithful-workflow.js",
  "assets/workflow-layout.js",
  ...fs
    .readdirSync(path.join(docs, "assets"))
    .filter((name) => /^chapter\d+-data\.js$/.test(name))
    .map((name) => `assets/${name}`),
];
for (const relativePath of lateLoaded) {
  checked += 1;
  const hash = hashOf(relativePath);
  if (versions[relativePath] !== hash) {
    problems.push(
      `${relativePath}의 번호가 번호표에 없거나 옛것입니다 (${
        versions[relativePath] || "없음"
      } → ${hash}).`
    );
  }
}

// 손으로 적어 둔 번호가 되살아나지 않게 합니다. 그것이 바로 예전 문제였습니다.
const bootstrap = fs.readFileSync(path.join(docs, "assets/guide-bootstrap-workflow.js"), "utf8");
if (/const version = "/.test(bootstrap)) {
  problems.push(
    "부트스트랩에 손으로 적은 자산 번호가 있습니다. 고칠 때마다 잊어버려 소용이 없습니다."
  );
}

if (problems.length) {
  console.error("자산 번호가 맞지 않습니다. node scripts/stamp_asset_versions.js 를 실행하세요:");
  problems.slice(0, 15).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 15) console.error(` … 외 ${problems.length - 15}건`);
  process.exit(1);
}

console.log(`asset versions valid: 자산 ${checked}개 모두 현재 파일과 같은 번호`);
