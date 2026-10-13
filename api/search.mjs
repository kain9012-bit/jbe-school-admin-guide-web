// 통합검색의 '뜻으로 찾기' 서버 함수(Vercel, Node.js).
//
// 브라우저의 낱말 검색은 그대로 두고, 이 함수는 검색어를 OpenRouter 임베딩(baai/bge-m3)으로
// 벡터로 바꾼 뒤 api/_data/rag-index.json의 조각 벡터와 코사인 유사도를 재어
// 가까운 조각의 id와 점수만 돌려줍니다. id는 docs/assets/guide-search-index.js의 항목 id와
// 같으므로, 브라우저가 두 순위를 합칩니다(RRF).
//
//   GET /api/search          → 준비 상태 {ok, chunks, keyConfigured}
//   GET /api/search?q=검색어  → {results: [{id, score}, ...]}
//
// 환경변수: OPENROUTER_API_KEY(필수), RAG_EMBED_MODEL(기본 baai/bge-m3 — 색인과 같아야 함),
//           SEARCH_PER_MINUTE(한 IP 1분 상한, 기본 30), SEARCH_DAILY_LIMIT(하루 상한, 기본 5000)
import fs from "node:fs";

export const config = { maxDuration: 15 };

const OPENROUTER = "https://openrouter.ai/api/v1";
const EMBED_MODEL = process.env.RAG_EMBED_MODEL || "baai/bge-m3";
const PER_MINUTE = Number(process.env.SEARCH_PER_MINUTE || 30);
const DAILY_LIMIT = Number(process.env.SEARCH_DAILY_LIMIT || 5000);
const TOP = 40;

let chunks = null;
function load() {
  if (chunks) return chunks;
  const file = new URL("./_data/rag-index.json", import.meta.url);
  if (!fs.existsSync(file)) throw new Error("검색 색인(api/_data/rag-index.json)이 없습니다.");
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  chunks = index.chunks.map((chunk) => {
    const bytes = Buffer.from(chunk.v, "base64");
    const vector = new Float32Array(bytes.length);
    let norm = 0;
    for (let at = 0; at < bytes.length; at += 1) {
      const value = bytes.readInt8(at) * chunk.s;
      vector[at] = value;
      norm += value * value;
    }
    norm = Math.sqrt(norm) || 1;
    for (let at = 0; at < vector.length; at += 1) vector[at] /= norm;
    return { id: chunk.id, vector };
  });
  return chunks;
}

// 같은 검색어는 다시 임베딩하지 않습니다(인스턴스 기억, 최대 500개).
const memo = new Map();
async function embed(key, text) {
  if (memo.has(text)) return memo.get(text);
  const response = await fetch(`${OPENROUTER}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://jbe-guide.vercel.app",
      "X-Title": "JBE School Admin Guide (search)",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!response.ok) throw new Error(`embedding ${response.status}`);
  const vector = (await response.json()).data[0].embedding;
  if (memo.size >= 500) memo.delete(memo.keys().next().value);
  memo.set(text, vector);
  return vector;
}

const perIp = new Map();
let dayKey = "";
let dayCount = 0;
function allowed(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
    perIp.clear();
  }
  if (dayCount >= DAILY_LIMIT) return false;
  const now = Date.now();
  const recent = (perIp.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= PER_MINUTE) return false;
  recent.push(now);
  perIp.set(ip, recent);
  dayCount += 1;
  return true;
}

function json(body, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

export async function GET(request) {
  const key = process.env.OPENROUTER_API_KEY;
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 200);
  try {
    load();
  } catch (error) {
    return json({ ok: false, error: error.message, keyConfigured: Boolean(key) }, 503);
  }
  if (!q) return json({ ok: Boolean(key), chunks: chunks.length, keyConfigured: Boolean(key) });
  if (!key) return json({ error: "서버에 API 키가 설정되지 않았습니다." }, 503);
  if (q.length < 2) return json({ results: [] });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
  if (!memo.has(q) && !allowed(ip)) return json({ error: "잠시 후 다시 시도해 주세요." }, 429);

  let query;
  try {
    query = await embed(key, q);
  } catch (error) {
    return json({ error: `임베딩 실패 (${error.message})` }, 502);
  }
  let norm = 0;
  for (const value of query) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  const scored = new Array(chunks.length);
  for (let at = 0; at < chunks.length; at += 1) {
    const vector = chunks[at].vector;
    let dot = 0;
    for (let i = 0; i < vector.length; i += 1) dot += vector[i] * query[i];
    scored[at] = [at, dot / norm];
  }
  scored.sort((a, b) => b[1] - a[1]);
  const results = scored.slice(0, TOP).map(([at, score]) => ({
    id: chunks[at].id,
    score: Math.round(score * 1000) / 1000,
  }));
  // 같은 검색어 결과는 CDN에 하루 묵혀 둡니다(색인이 바뀌면 배포로 새로 고쳐집니다).
  return json({ results }, 200, "public, s-maxage=86400, max-age=300");
}
