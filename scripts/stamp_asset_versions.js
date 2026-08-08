// 자산 주소 뒤에 파일 내용에서 뽑은 짧은 번호를 붙입니다.
//
//   assets/global-home.js  →  assets/global-home.js?v=3f2a91c4
//
// 왜 필요한가
//   고친 것을 올려도 이용자 브라우저는 예전에 받아 둔 파일을 그대로 씁니다.
//   'Ctrl+F5를 눌러 보세요'라고 안내할 수는 없습니다.
//   파일이 바뀌면 주소가 바뀌므로 브라우저가 새로 받습니다. 안 바뀌면 그대로 씁니다.
//
// 예전에는 부트스트랩에 '20260731-home-only'라고 손으로 적어 두었는데,
// 그 뒤로 한 번도 고치지 않아 아무 소용이 없었습니다. 그래서 자동으로 만듭니다.
//
// 사용법: node scripts/stamp_asset_versions.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

function hashOf(relativePath) {
  const file = path.join(docs, relativePath);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}

// 주소에 이미 붙어 있는 번호는 떼고 다시 붙입니다. 여러 번 돌려도 같은 결과입니다.
const strip = (value) => value.replace(/\?v=[0-9a-z-]+$/i, "");

const versions = {};
let stamped = 0;

// 1. index.html 안의 <link>·<script>
const htmlFile = path.join(docs, "index.html");
let html = fs.readFileSync(htmlFile, "utf8");
html = html.replace(
  /(href|src)="((?:assets|vendor)\/[^"?]+(?:\?v=[0-9a-z-]+)?)"/gi,
  (match, attribute, url) => {
    const clean = strip(url);
    const hash = hashOf(clean);
    if (!hash) return match;
    versions[clean] = hash;
    stamped += 1;
    return `${attribute}="${clean}?v=${hash}"`;
  }
);
fs.writeFileSync(htmlFile, html, "utf8");

// 2. 화면이 나중에 불러오는 파일들 (편별 원문, 홈, 본문 화면)
//    부트스트랩이 주소를 만들 때 이 표를 찾아봅니다.
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
  const hash = hashOf(relativePath);
  if (hash) {
    versions[relativePath] = hash;
    stamped += 1;
  }
}

const table = Object.keys(versions)
  .sort()
  .map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(versions[key])}`)
  .join(",\n");

fs.writeFileSync(
  path.join(docs, "assets", "asset-versions.js"),
  "// 이 파일은 scripts/stamp_asset_versions.js가 만들어 냅니다.\n" +
    "// 손으로 고치지 마세요. 자산을 바꾼 뒤 스크립트를 다시 실행하세요.\n" +
    `window.GUIDE_ASSET_VERSIONS = {\n${table}\n};\n`,
  "utf8"
);

// asset-versions.js 자신도 바뀌었으므로 index.html에 다시 번호를 붙입니다.
const selfHash = hashOf("assets/asset-versions.js");
html = fs
  .readFileSync(htmlFile, "utf8")
  .replace(
    /(src)="(assets\/asset-versions\.js)(?:\?v=[0-9a-z-]+)?"/i,
    `$1="$2?v=${selfHash}"`
  );
fs.writeFileSync(htmlFile, html, "utf8");

console.log(`자산 번호 ${stamped}개 붙임 (index.html + 나중에 불러오는 파일)`);
