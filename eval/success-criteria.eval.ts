// PLAN 작업 22: 테스트 질문 10개로 성공 기준 점검 (Design §8.3, Plan SC-2·SC-3·SC-4)
// 실행: npm run eval  (실제 AI를 부르므로 아주 적은 요금이 든다. 평소 점검 npm test에는 포함되지 않는다)
// 기본은 시험용 예시 가게(eval/fixture-restaurants.json)로 돌린다. 실제 목록으로 돌리려면 EVAL_DATA=real npm run eval
// 결과는 docs/test-results.md에 표로 남는다. SC-4("가 볼 만함")는 작성자가 결과를 보고 직접 판단한다.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/recommend/route";
import { filterCandidates, resolveMaxWalkMinutes } from "@/lib/filter";
import { loadRestaurants, validateRestaurants } from "@/lib/restaurants";
import type { RecommendRequest, RecommendResponse, Restaurant } from "@/lib/types";
import { checkReason, MAX_SAME_CUISINE, RECOMMEND_COUNT } from "@/lib/verify";

const useRealData = process.env.EVAL_DATA === "real";

vi.mock("@/lib/restaurants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/restaurants")>()),
  loadRestaurants: vi.fn(),
}));

/** Design §8.3 테스트 질문 10개 */
const QUESTIONS: Omit<RecommendRequest, "needRoom" | "needReservation" | "maxWalkMinutes" | "cuisines">[] &
  Partial<RecommendRequest>[] = [
  { purpose: "lunch", people: 2, budget: 10000 },
  { purpose: "lunch", people: 4, budget: 15000, cuisines: ["한식"], maxWalkMinutes: 5 },
  { purpose: "lunch", people: 3, budget: 12000, cuisines: ["일식", "중식"], maxWalkMinutes: 10 },
  { purpose: "lunch", people: 2, budget: 30000, cuisines: ["양식"], maxWalkMinutes: 15 },
  { purpose: "lunch", people: 4, budget: 8000, maxWalkMinutes: 5 },
  { purpose: "dinner", people: 10, budget: 30000, cuisines: ["고기"], needRoom: true, needReservation: true },
  { purpose: "dinner", people: 6, budget: 25000, cuisines: ["한식", "일식"], maxWalkMinutes: 10, needReservation: true },
  { purpose: "dinner", people: 20, budget: 40000, maxWalkMinutes: 15, needRoom: true, needReservation: true },
  { purpose: "dinner", people: 8, budget: 20000, cuisines: ["중식"], needRoom: true },
  { purpose: "dinner", people: 15, budget: 50000, maxWalkMinutes: 5, needRoom: true, needReservation: true },
];

type Row = {
  no: number;
  condition: string;
  candidates: number;
  picks: string[];
  conditionViolations: string[];
  inventedOrChanged: string[];
  otherIssues: string[];
  retried: boolean;
  ms: number;
  status: number;
  notice?: string;
};

function describeCondition(q: RecommendRequest): string {
  const parts = [
    q.purpose === "lunch" ? "점심" : "회식",
    `${q.people}명`,
    `${q.budget.toLocaleString("ko-KR")}원`,
    q.cuisines.length > 0 ? q.cuisines.join("·") : "메뉴 상관없음",
    q.maxWalkMinutes ? `${q.maxWalkMinutes}분` : `거리 기본(${resolveMaxWalkMinutes(q)}분)`,
  ];
  if (q.needRoom) parts.push("룸");
  if (q.needReservation) parts.push("예약");
  return parts.join(", ");
}

/** SC-2: 결과 가게가 입력 조건을 모두 지키는지 (필터 코드와 별개로 다시 계산한다) */
function conditionViolations(r: Restaurant, q: RecommendRequest): string[] {
  const out: string[] = [];
  if (r.pricePerPerson > q.budget) out.push(`${r.id} 예산 초과`);
  if (r.maxCapacity < q.people) out.push(`${r.id} 인원 부족`);
  if (q.needRoom && (!r.hasRoom || r.roomCapacity < q.people)) out.push(`${r.id} 룸 조건 위반`);
  if (q.needReservation && r.reservation !== "가능") out.push(`${r.id} 예약 조건 위반`);
  if (r.walkMinutes > resolveMaxWalkMinutes(q)) out.push(`${r.id} 거리 초과`);
  return out;
}

it("테스트 질문 10개 — 성공 기준 SC-2·SC-3", async () => {
  // 평가에 쓸 목록 준비 (기본: 시험용 예시 가게)
  let restaurants: Restaurant[];
  if (useRealData) {
    const actual = await vi.importActual<typeof import("@/lib/restaurants")>("@/lib/restaurants");
    restaurants = await actual.loadRestaurants();
  } else {
    const fixture = JSON.parse(await readFile(join(process.cwd(), "eval", "fixture-restaurants.json"), "utf8"));
    const checked = validateRestaurants(fixture);
    if (!checked.ok) throw new Error(checked.problems.join("\n"));
    restaurants = checked.restaurants;
  }
  vi.mocked(loadRestaurants).mockResolvedValue(restaurants);
  const byId = new Map(restaurants.map((r) => [r.id, r]));

  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const rows: Row[] = [];

  for (const [index, raw] of QUESTIONS.entries()) {
    const q: RecommendRequest = {
      cuisines: [],
      needRoom: false,
      needReservation: false,
      maxWalkMinutes: undefined,
      ...raw,
    } as RecommendRequest;
    const candidates = filterCandidates(restaurants, q);
    warn.mockClear();

    const started = Date.now();
    const res = await POST(
      new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(q) }),
    );
    const ms = Date.now() - started;
    const data = (await res.json()) as RecommendResponse;
    const recs = res.ok ? data.recommendations : [];

    const row: Row = {
      no: index + 1,
      condition: describeCondition(q),
      candidates: candidates.length,
      picks: recs.map((r) => `${r.name} — ${r.reason}`),
      conditionViolations: recs.flatMap((r) => conditionViolations(r, q)),
      inventedOrChanged: [],
      otherIssues: [],
      retried: warn.mock.calls.length > 0,
      ms,
      status: res.status,
      notice: data.notice,
    };

    // SC-3: 목록에 없는 가게, 목록과 다른 값
    for (const r of recs) {
      const original = byId.get(r.id);
      if (!original) row.inventedOrChanged.push(`${r.id} 목록에 없음`);
      else if (JSON.stringify({ ...r, reason: undefined }) !== JSON.stringify({ ...original, reason: undefined })) {
        row.inventedOrChanged.push(`${r.id} 값이 목록과 다름`);
      }
    }

    // 그 밖의 규칙: 개수, 같은 메뉴 2곳, 이유 규칙, 응답 코드
    if (!res.ok) row.otherIssues.push(`HTTP ${res.status}`);
    const expected = Math.min(RECOMMEND_COUNT, candidates.length);
    if (recs.length !== expected && !data.notice) row.otherIssues.push(`개수 ${recs.length}/${expected}`);
    const cuisineCount = new Map<string, number>();
    for (const r of recs) cuisineCount.set(r.cuisine, (cuisineCount.get(r.cuisine) ?? 0) + 1);
    if ([...cuisineCount.values()].some((n) => n > MAX_SAME_CUISINE)) row.otherIssues.push("같은 메뉴 3곳");
    for (const r of recs) {
      const problems = checkReason(r.reason, r, q.people);
      if (problems.length > 0) row.otherIssues.push(`${r.id} 이유: ${problems.join(", ")}`);
    }
    rows.push(row);
  }
  warn.mockRestore();

  await writeFile(join(process.cwd(), "docs", "test-results.md"), renderReport(rows, restaurants.length), "utf8");

  // 성공 기준: 조건 위반 0건(SC-2), 지어낸 가게·바뀐 값 0건(SC-3)
  expect(rows.flatMap((r) => r.conditionViolations)).toEqual([]);
  expect(rows.flatMap((r) => r.inventedOrChanged)).toEqual([]);
  expect(rows.flatMap((r) => r.otherIssues)).toEqual([]);
});

function renderReport(rows: Row[], listSize: number): string {
  const sc2 = rows.reduce((n, r) => n + r.conditionViolations.length, 0);
  const sc3 = rows.reduce((n, r) => n + r.inventedOrChanged.length, 0);
  const other = rows.reduce((n, r) => n + r.otherIssues.length, 0);
  const totalPicks = rows.reduce((n, r) => n + r.picks.length, 0);
  const avgMs = Math.round(rows.reduce((n, r) => n + r.ms, 0) / rows.length);
  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    "# 성공 기준 점검 결과 (PLAN 작업 22)",
    "",
    `> 실행일: ${today} · 목록: ${useRealData ? "실제 목록 data/restaurants.json" : "**시험용 예시 가게** eval/fixture-restaurants.json"} (${listSize}곳) · 실행: \`npm run eval\``,
    useRealData
      ? ""
      : "> ⚠ 시험용 예시 가게로 돌린 결과다. SC-2·SC-3(코드가 지키는 규칙)은 이것으로 확인되지만, SC-4는 실제 식당 데이터를 채운 뒤 `EVAL_DATA=real npm run eval`로 다시 돌려 작성자가 판단해야 한다.",
    "",
    "## 요약",
    "",
    "| 기준 | 목표 | 결과 |",
    "|---|---|---|",
    `| SC-2 입력 조건(인원·예산·거리·룸·예약) 준수 | 100% | ${sc2 === 0 ? "✅" : "❌"} 추천 ${totalPicks}곳 중 위반 ${sc2}건 |`,
    `| SC-3 목록에 없는 가게·바뀐 값 | 0건 | ${sc3 === 0 ? "✅" : "❌"} ${sc3}건 |`,
    `| 그 밖의 규칙(개수·같은 메뉴 2곳·이유 50자·숫자 일치) | 0건 | ${other === 0 ? "✅" : "❌"} ${other}건 |`,
    `| SC-4 10개 중 "가 볼 만함" | 8개 이상 | ⏳ 작성자 판단 (아래 표의 빈칸에 ○/× 표시) |`,
    `| 응답 시간 | 대체로 10초 이내 | 평균 ${(avgMs / 1000).toFixed(1)}초 |`,
    "",
    "## 질문별 결과",
    "",
    "| # | 조건 | 후보 | 추천 (가게 — 이유) | 안내 | 재요청 | 시간 | 문제 | 가 볼 만함 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const issues = [...r.conditionViolations, ...r.inventedOrChanged, ...r.otherIssues];
    lines.push(
      `| ${r.no} | ${r.condition} | ${r.candidates}곳 | ${r.picks.length > 0 ? r.picks.join("<br>") : "(없음)"} | ${r.notice ?? ""} | ${r.retried ? "예" : ""} | ${(r.ms / 1000).toFixed(1)}초 | ${issues.length > 0 ? issues.join("<br>") : "없음"} |  |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
