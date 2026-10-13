// 의미 검색·챗봇이 함께 쓰는 벡터 색인(api/_data/rag-index.json)을 만듭니다.
//
//   node scripts/build_rag_index.mjs          임베딩까지(OpenRouter 키 필요)
//   node scripts/build_rag_index.mjs --dry    조각만 확인(키 불필요)
//
// 재료는 통합검색 색인(docs/assets/guide-search-index.js)입니다. 화면의 낱말 검색과
// 같은 조각·같은 id를 써야 두 점수를 합칠 수 있습니다(api/search.mjs가 id를 돌려줌).
// 그러므로 원문이 바뀌면 순서대로:
//   node scripts/build_structured_search_index.js
//   node scripts/build_rag_index.mjs
//
// 키는 환경변수 OPENROUTER_API_KEY, 없으면 저장소의 .env.local(깃에 올라가지 않음)에서
// 읽습니다. 키는 화면에도 결과 파일에도 남기지 않습니다.
// 한 번 받은 임베딩은 tmp/rag-embed-cache.json에 글 해시로 기억해, 바뀐 조각만 다시 받습니다.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "api", "_data", "rag-index.json");
const CACHE = path.join(ROOT, "tmp", "rag-embed-cache.json");
const DRY = process.argv.includes("--dry");
const MODEL = process.env.RAG_EMBED_MODEL || "baai/bge-m3";
const EMBED_CHARS = 2000; // 임베딩에 넣는 글 길이 상한
const CONTEXT_CHARS = 1600; // 챗봇 근거로 넣는 글 길이 상한

function readKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((one) => /^\s*OPENROUTER_API_KEY\s*=/.test(one));
  return line ? line.replace(/^\s*OPENROUTER_API_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim() : "";
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "docs", "assets", "guide-search-index.js"), "utf8"), sandbox);
const items = sandbox.window.GUIDE_SEARCH_INDEX;

function urlOf(item) {
  const params = new URLSearchParams();
  if (item.workId) params.set("work", item.workId);
  if (item.blockId) params.set("block", item.blockId);
  if (item.anchor) params.set("at", item.anchor);
  if (item.formId) params.set("form", item.formId);
  if (item.faqNumber) params.set("faq", item.faqNumber);
  return `?chapter=${item.chapterId}#${params.toString()}`;
}

const KIND = { "업무": "업무", "매뉴얼 원문": "본문", "FAQ 원문": "질문", "서식·예시 원문": "서식" };
const chunks = items.map((item) => {
  const title = String(item.title || "").replace(/^세부내용\s+/, "");
  const heading = [`${item.chapterLabel} ${item.chapterTitle}`, item.workTitle, title === item.workTitle ? "" : title]
    .filter(Boolean)
    .join(" › ");
  // 색인 글의 첫 줄은 업무 이름입니다. 머리글에 이미 있으므로 뺍니다.
  const body = String(item.text || "").split("\n").slice(1).join("\n").trim();
  return {
    id: item.id,
    kind: KIND[item.type] || "본문",
    heading: `${heading}${item.type === "FAQ 원문" ? " (자주 묻는 질문)" : item.type === "서식·예시 원문" ? " (서식)" : ""}`,
    url: urlOf(item),
    embedText: `${heading}\n${body}`.slice(0, EMBED_CHARS),
    text: `${heading}\n${body}`.slice(0, CONTEXT_CHARS),
  };
});

const chars = chunks.reduce((sum, one) => sum + one.embedText.length, 0);
console.log(`조각 ${chunks.length}개, 임베딩 글자 ${chars.toLocaleString()}자`);
if (DRY) process.exit(0);

const KEY = readKey();
if (!KEY) {
  console.error("OpenRouter 키가 없습니다. 환경변수 OPENROUTER_API_KEY 또는 .env.local에 넣어 주세요.");
  process.exit(1);
}

const hash = (text) => crypto.createHash("sha1").update(`${MODEL}\n${text}`).digest("hex");
let cache = {};
if (fs.existsSync(CACHE)) cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

async function embed(texts, attempt = 1) {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://jbe-guide.vercel.app",
      "X-Title": "jbe-school-admin-guide index",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      return embed(texts, attempt + 1);
    }
    throw new Error(`임베딩 실패 ${response.status}: ${detail}`);
  }
  const json = await response.json();
  return json.data.sort((a, b) => a.index - b.index).map((one) => one.embedding);
}

// float 벡터를 int8로 줄입니다(벡터마다 가장 큰 절댓값으로 나눠 127에 맞춤).
function quantize(vector) {
  let peak = 0;
  for (const value of vector) peak = Math.max(peak, Math.abs(value));
  const scale = peak / 127 || 1;
  const bytes = new Int8Array(vector.length);
  for (let at = 0; at < vector.length; at += 1) bytes[at] = Math.round(vector[at] / scale);
  return { s: Number(scale.toPrecision(6)), v: Buffer.from(bytes.buffer).toString("base64") };
}

const todo = chunks.filter((one) => !cache[hash(one.embedText)]);
console.log(`임베딩 받을 조각 ${todo.length}개 (기억해 둔 것 ${chunks.length - todo.length}개)`);
const BATCH = 32;
for (let at = 0; at < todo.length; at += BATCH) {
  const batch = todo.slice(at, at + BATCH);
  const vectors = await embed(batch.map((one) => one.embedText));
  batch.forEach((one, index) => {
    cache[hash(one.embedText)] = quantize(vectors[index]);
  });
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  process.stdout.write(`\r${Math.min(at + BATCH, todo.length)}/${todo.length}`);
}
if (todo.length) process.stdout.write("\n");

const sample = cache[hash(chunks[0].embedText)];
const dims = Buffer.from(sample.v, "base64").length;
const out = {
  model: MODEL,
  dims,
  builtAt: new Date().toISOString(),
  chunks: chunks.map(({ embedText, ...rest }) => ({ ...rest, ...cache[hash(embedText)] })),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${path.relative(ROOT, OUT)} 저장 (${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB, ${dims}차원)`);
