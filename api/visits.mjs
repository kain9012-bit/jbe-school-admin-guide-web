// 방문 수(오늘·누적)를 GoatCounter API에서 바로 읽어 주는 서버 함수.
//
// 공개 카운터(/counter//.json)는 GoatCounter가 최대 몇 시간 캐시하므로 숫자가
// 늦게 바뀝니다. API는 캐시가 없어 집계 지연(몇 분)만 있습니다. API 토큰은
// 브라우저에 둘 수 없으므로 이 함수가 대신 묻고, 결과만 60초 캐시해 돌려줍니다.
// 토큰이 없으면 503을 돌려주고, 화면(header-v3.js)은 공개 카운터로 돌아갑니다.
//
// 환경변수(Vercel → Settings → Environment Variables)
//   GOATCOUNTER_API_TOKEN  GoatCounter 설정 → API tokens에서 만든 토큰(권한: 통계 읽기)
//   GOATCOUNTER_SITE       기본 https://jbe-guide.goatcounter.com
//
// 사람 수는 '/' 경로의 방문(visits)으로 봅니다. 페이지뷰는 경로를 전부 '/'로
// 통일해 보내므로(index.html) 같은 세션의 한 사람은 1입니다.
const SITE = (process.env.GOATCOUNTER_SITE || "https://jbe-guide.goatcounter.com").replace(/\/+$/, "");
const TOKEN = process.env.GOATCOUNTER_API_TOKEN;
const SINCE = "2026-01-01T00:00:00Z"; // 누적의 시작(사이트 개설 전이면 충분)
const CACHE_MS = 60_000;

let cached = null;
let cachedAt = 0;

// 오늘 0시(한국 시간)를 UTC로.
function todayUtc(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const midnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(midnight - 9 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function total(start) {
  const url = new URL(`${SITE}/api/v0/stats/total`);
  url.searchParams.set("start", start);
  url.searchParams.set("include_paths", "/");
  url.searchParams.set("path_by_name", "true");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`goatcounter ${response.status}`);
  const json = await response.json();
  return Number(json.total ?? 0);
}

function json(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=300` : "no-store",
    },
  });
}

export async function GET() {
  if (!TOKEN) return json({ error: "GOATCOUNTER_API_TOKEN이 없습니다." }, 503);
  if (cached && Date.now() - cachedAt < CACHE_MS) return json(cached, 200, 60);
  try {
    const [all, today] = await Promise.all([total(SINCE), total(todayUtc())]);
    cached = { total: all, today, updatedAt: new Date().toISOString() };
    cachedAt = Date.now();
    return json(cached, 200, 60);
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
