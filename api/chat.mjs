// 길라잡이 챗봇 서버 함수(Vercel, Node.js).
//
// 흐름
//   1. 질문을 받아 OpenRouter 임베딩(baai/bge-m3)으로 벡터를 만듭니다.
//   2. api/_data/rag-index.json의 조각(19편 소제목 블록·FAQ)과 코사인 유사도를 재고,
//      낱말 검색(BM25)도 함께 돌려 둘을 합칩니다(RRF). 법령 조문 번호·서식 이름처럼
//      낱말이 중요한 질문은 낱말 검색이, 말을 바꿔 물은 질문은 벡터 검색이 잡습니다.
//   3. 상위 조각을 근거로 Gemini Flash에게 '이 근거 안에서만' 답하게 하고,
//      답을 글자 단위로 흘려보냅니다. 첫 줄은 근거 목록(JSON), 그 다음부터가 답입니다.
//
// 비밀·설정은 환경변수로만 받습니다(Vercel 프로젝트 설정 → Environment Variables).
//   OPENROUTER_API_KEY   필수. OpenRouter 키. 바뀌면 여기만 고칩니다.
//   RAG_CHAT_MODEL       답을 쓰는 모델(기본 google/gemini-2.5-flash)
//   RAG_EMBED_MODEL      질문 임베딩 모델(기본 baai/bge-m3 — 색인과 같아야 함)
//   RAG_DAILY_LIMIT      하루 답변 상한(기본 500). 함수 인스턴스 기준의 어림 제한이므로
//                        진짜 안전장치는 OpenRouter 키의 지출 한도(Credit limit)입니다.
//   RAG_PER_MINUTE       한 IP가 1분에 물을 수 있는 횟수(기본 5)
import fs from "node:fs";

export const config = { maxDuration: 60 };

const OPENROUTER = "https://openrouter.ai/api/v1";
const CHAT_MODEL = process.env.RAG_CHAT_MODEL || "google/gemini-2.5-flash";
const EMBED_MODEL = process.env.RAG_EMBED_MODEL || "baai/bge-m3";
const DAILY_LIMIT = Number(process.env.RAG_DAILY_LIMIT || 500);
const PER_MINUTE = Number(process.env.RAG_PER_MINUTE || 5);
const TOP_K = 8;
const CONTEXT_CHARS = 9000;

// ── 색인 읽기(인스턴스가 처음 뜰 때 한 번) ─────────────────────────────
let index = null;
let lexical = null;
function loadIndex() {
  if (index) return index;
  const file = new URL("./_data/rag-index.json", import.meta.url);
  if (!fs.existsSync(file)) {
    throw new Error("검색 색인(api/_data/rag-index.json)이 없습니다. scripts/build_rag_index.mjs를 먼저 실행하세요.");
  }
  const raw = fs.readFileSync(file, "utf8");
  index = JSON.parse(raw);
  for (const chunk of index.chunks) {
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
    chunk.vector = vector;
    delete chunk.v;
  }
  lexical = buildLexical(index.chunks);
  return index;
}

// ── 낱말 검색(BM25) ─────────────────────────────────────────────────────
// 한국어는 띄어쓰기 단위 낱말에 조사가 붙으므로, 낱말 그대로와 두 글자씩 자른
// 조각을 함께 씁니다('휴직수당은' → 휴직수당은, 휴직, 직수, 수당, 당은).
function tokenize(text) {
  const out = [];
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  for (const word of words) {
    out.push(word);
    if (word.length >= 3) {
      for (let at = 0; at + 2 <= word.length; at += 1) out.push(word.slice(at, at + 2));
    }
  }
  return out;
}

function buildLexical(chunks) {
  const df = new Map();
  const docs = chunks.map((chunk) => {
    const tf = new Map();
    const tokens = tokenize(chunk.text);
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    for (const token of tf.keys()) df.set(token, (df.get(token) || 0) + 1);
    return { tf, length: tokens.length };
  });
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1);
  return { df, docs, average, count: docs.length };
}

function lexicalSearch(query, limit) {
  const { df, docs, average, count } = lexical;
  const terms = [...new Set(tokenize(query))];
  const k1 = 1.2;
  const b = 0.75;
  const scores = new Float64Array(docs.length);
  for (const term of terms) {
    const n = df.get(term);
    if (!n) continue;
    const idf = Math.log(1 + (count - n + 0.5) / (n + 0.5));
    docs.forEach((doc, at) => {
      const tf = doc.tf.get(term);
      if (!tf) return;
      scores[at] += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / average)));
    });
  }
  return [...scores.keys()]
    .filter((at) => scores[at] > 0)
    .sort((a, b2) => scores[b2] - scores[a])
    .slice(0, limit);
}

function vectorSearch(query, limit) {
  const { chunks } = index;
  let norm = 0;
  for (const value of query) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  const scored = chunks.map((chunk, at) => {
    let dot = 0;
    const vector = chunk.vector;
    for (let i = 0; i < vector.length; i += 1) dot += vector[i] * query[i];
    return [at, dot / norm];
  });
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map((one) => one[0]);
}

// 두 순위를 합칩니다(Reciprocal Rank Fusion).
function fuse(lists, limit) {
  const score = new Map();
  for (const list of lists) {
    list.forEach((at, rank) => score.set(at, (score.get(at) || 0) + 1 / (60 + rank)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((one) => one[0]);
}

// ── OpenRouter ──────────────────────────────────────────────────────────
function headers(key) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://jbe-guide.vercel.app",
    "X-Title": "학교행정업무 길라잡이 챗봇",
  };
}

async function embedQuery(key, text) {
  const response = await fetch(`${OPENROUTER}/embeddings`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!response.ok) throw new Error(`embedding ${response.status}`);
  const json = await response.json();
  return json.data[0].embedding;
}

const SYSTEM = `당신은 전북특별자치도교육청 「학교행정업무 길라잡이」 웹판의 안내 도우미입니다.
학교 행정실 직원이 묻는 질문에, 아래에 주어진 길라잡이 근거만으로 답합니다.

규칙
- 근거에 있는 내용만 답합니다. 근거에 없으면 "길라잡이에서 해당 내용을 찾지 못했습니다"라고 말하고, 관련 있어 보이는 편·업무 이름만 알려 줍니다. 추측하거나 일반 지식으로 채우지 않습니다.
- 답 안에서 근거를 쓴 자리마다 근거 번호를 [1], [2]처럼 답니다.
- 절차는 순서대로, 기한·수치·법령 조문은 근거에 적힌 그대로 옮깁니다.
- 한국어 존댓말로, 짧은 문단이나 '-' 목록으로 간결하게 씁니다. 표를 쓰지 않습니다.
- 마지막 줄에 "※ 최종 확인은 길라잡이 원문과 관련 법령을 우선합니다."를 붙입니다.`;

function buildMessages(question, history, picked) {
  const context = picked
    .map((chunk, at) => `[${at + 1}] ${chunk.text}`)
    .join("\n\n");
  const past = (Array.isArray(history) ? history : [])
    .slice(-6)
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant"))
    .map((turn) => ({ role: turn.role, content: String(turn.content || "").slice(0, 2000) }));
  return [
    { role: "system", content: SYSTEM },
    ...past,
    {
      role: "user",
      content: `근거:\n${context}\n\n질문: ${question}`,
    },
  ];
}

// ── 사용량 제한(인스턴스 기준 어림) ────────────────────────────────────
const perIp = new Map();
let dayKey = "";
let dayCount = 0;
function allowed(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_LIMIT) return "오늘 답변 한도에 이르렀습니다. 내일 다시 이용해 주세요.";
  const now = Date.now();
  const recent = (perIp.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= PER_MINUTE) return "질문이 너무 잦습니다. 잠시 후 다시 물어 주세요.";
  recent.push(now);
  perIp.set(ip, recent);
  dayCount += 1;
  return "";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function POST(request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "서버에 API 키가 설정되지 않았습니다." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "요청 형식이 잘못되었습니다." }, 400);
  }
  const question = String(body.question || "").trim().slice(0, 500);
  if (question.length < 2) return json({ error: "질문을 적어 주세요." }, 400);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
  const denied = allowed(ip);
  if (denied) return json({ error: denied }, 429);

  let picked;
  try {
    loadIndex();
    const queryVector = await embedQuery(key, question);
    const byVector = vectorSearch(queryVector, 20);
    const byWords = lexicalSearch(question, 20);
    const order = fuse([byVector, byWords], TOP_K * 2);
    picked = [];
    let used = 0;
    for (const at of order) {
      const chunk = index.chunks[at];
      if (used + chunk.text.length > CONTEXT_CHARS && picked.length >= 3) continue;
      picked.push(chunk);
      used += chunk.text.length;
      if (picked.length >= TOP_K) break;
    }
  } catch (error) {
    return json({ error: `검색 중 오류가 났습니다 (${error.message}).` }, 502);
  }

  const upstream = await fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: buildMessages(question, body.history, picked),
      stream: true,
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json({ error: `답변 생성에 실패했습니다 (${upstream.status}). ${text.slice(0, 200)}` }, 502);
  }

  const sources = picked.map((chunk, at) => ({
    n: at + 1,
    heading: chunk.heading,
    url: chunk.url,
  }));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ sources })}\n`));
      const reader = upstream.body.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // 조각난 JSON은 다음 덩어리와 이어집니다.
            }
          }
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\n(답변이 중간에 끊겼습니다: ${error.message})`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  try {
    loadIndex();
  } catch (error) {
    return json({ ok: false, error: error.message, keyConfigured: Boolean(process.env.OPENROUTER_API_KEY) }, 503);
  }
  return json({
    ok: true,
    chunks: index.chunks.length,
    embedModel: index.model,
    chatModel: CHAT_MODEL,
    builtAt: index.builtAt,
    keyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
}
