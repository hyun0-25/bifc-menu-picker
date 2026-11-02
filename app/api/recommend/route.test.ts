// PLAN 작업 9·13 점검: POST /api/recommend의 전체 흐름 (입력 검사 → 목록 → 필터 → AI → 검사·보정 → 응답)
// 실제 목록 파일과 실제 AI 대신, 고정된 시험용 가게 3곳과 정해 둔 가짜 AI 답을 바꿔 끼워 시험한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError, AiTimeoutError, requestAiPicks } from "@/lib/ai";
import { loadRestaurants, RestaurantDataError } from "@/lib/restaurants";
import type { AiPick, ErrorResponse, RecommendResponse, Restaurant } from "@/lib/types";
import { NOTICES } from "@/lib/verify";
import { POST } from "./route";

vi.mock("@/lib/restaurants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/restaurants")>()),
  loadRestaurants: vi.fn(),
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  requestAiPicks: vi.fn(),
}));

const shops: Restaurant[] = [
  { id: "s1", name: "시험 국밥", cuisine: "한식", pricePerPerson: 11000, walkMinutes: 5, maxCapacity: 30, hasRoom: false, roomCapacity: 0, groupSeating: false, reservation: "불가" },
  { id: "s2", name: "시험 중식", cuisine: "중식", pricePerPerson: 25000, walkMinutes: 8, maxCapacity: 20, hasRoom: true, roomCapacity: 12, groupSeating: true, reservation: "가능" },
  { id: "s3", name: "시험 스시", cuisine: "일식", pricePerPerson: 18000, walkMinutes: 12, maxCapacity: 8, hasRoom: false, roomCapacity: 0, groupSeating: false, reservation: "정보 없음" },
];

/** AI가 후보를 받은 순서 그대로, 규칙에 맞는 이유로 고른다고 가정하는 가짜 답 */
const goodReasons: Record<string, string> = {
  s1: "도보 5분, 1인 11,000원으로 가볍게",
  s2: "1인 25,000원, 도보 8분, 룸 12명",
  s3: "1인 18,000원, 도보 12분, 최대 8명",
};

beforeEach(() => {
  vi.mocked(loadRestaurants).mockResolvedValue(shops);
  vi.mocked(requestAiPicks).mockReset();
  vi.mocked(requestAiPicks).mockImplementation(async (_request, candidates): Promise<AiPick[]> =>
    candidates.map((c) => ({ id: c.id, reason: goodReasons[c.id] })),
  );
});

function call(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/api/recommend", { method: "POST", body: text }));
}

const lunch = { purpose: "lunch", people: 2, budget: 30000 };

describe("POST /api/recommend — 정상", () => {
  it("걸러진 후보만 AI에 보내고, AI 이유와 목록 값으로 응답한다", async () => {
    const res = await call(lunch);
    expect(res.status).toBe(200);
    const data: RecommendResponse = await res.json();

    // 점심 기본 거리 10분 → s3(12분)은 AI에 보내지도 않는다
    const sentCandidates = vi.mocked(requestAiPicks).mock.calls[0][1];
    expect(sentCandidates.map((c) => c.id)).toEqual(["s1", "s2"]);

    expect(data.recommendations).toEqual([
      { ...shops[0], reason: goodReasons.s1 },
      { ...shops[1], reason: goodReasons.s2 },
    ]);
    expect(data.notice).toBe(NOTICES.fewCandidates);
  });

  it("후보가 3곳이면 3곳을 돌려주고 안내가 없다", async () => {
    const data: RecommendResponse = await (await call({ ...lunch, purpose: "dinner" })).json();
    expect(data.recommendations.map((r) => r.id)).toEqual(["s1", "s2", "s3"]);
    expect(data.notice).toBeUndefined();
  });

  it("AI가 걸러진 가게·지어낸 가게를 골라도 응답에는 후보만 나오고 3곳이 채워진다", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([
      { id: "가짜맛집", reason: "1인 9,000원, 도보 1분" },
      { id: "s2", reason: goodReasons.s2 },
    ]);
    const data: RecommendResponse = await (await call({ ...lunch, purpose: "dinner" })).json();
    expect(requestAiPicks).toHaveBeenCalledTimes(2); // 문제가 있어 1회 다시 요청
    expect(data.recommendations.map((r) => r.id)).toEqual(["s2", "s1", "s3"]);
    expect(JSON.stringify(data)).not.toContain("가짜맛집");
  });

  it("AI가 숫자를 틀리게 써도 화면에는 목록 값과 맞는 이유만 나온다", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([{ id: "s1", reason: "도보 3분, 1인 9,000원" }]);
    const data: RecommendResponse = await (await call(lunch)).json();
    expect(data.recommendations[0].reason).toBe("1인 11,000원, 도보 5분, 최대 30명");
  });
});

describe("POST /api/recommend — 후보 0곳", () => {
  it("AI를 부르지 않고 빈 목록과 완화 안내 (점검표 #3)", async () => {
    const res = await call({ purpose: "dinner", people: 30, budget: 5000, needRoom: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recommendations: [], notice: NOTICES.none });
    expect(requestAiPicks).not.toHaveBeenCalled();
  });
});

describe("POST /api/recommend — 오류", () => {
  it("입력이 잘못되면 400과 칸별 안내, AI는 부르지 않는다 (점검표 #2·#6)", async () => {
    const res = await call({ ...lunch, people: 0, budget: 1000 });
    expect(res.status).toBe(400);
    const data: ErrorResponse = await res.json();
    expect(data.error.code).toBe("INVALID_INPUT");
    expect(Object.keys(data.error.fields ?? {}).sort()).toEqual(["budget", "people"]);
    expect(requestAiPicks).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 요청은 400", async () => {
    const res = await call("{이건 JSON이 아님");
    expect(res.status).toBe(400);
    const data: ErrorResponse = await res.json();
    expect(data.error.fields).toEqual({ form: "요청 형식이 올바르지 않습니다" });
  });

  it("너무 큰 요청은 400", async () => {
    const res = await call({ ...lunch, cuisines: ["한식".repeat(6000)] });
    expect(res.status).toBe(400);
  });

  it("목록 파일에 문제가 있으면 500 DATA_ERROR (자세한 문제는 화면에 내보내지 않음)", async () => {
    vi.mocked(loadRestaurants).mockRejectedValue(new RestaurantDataError(["1번째 가게(s1): 비밀 경로"]));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(lunch);
    expect(res.status).toBe(500);
    const data: ErrorResponse = await res.json();
    expect(data.error.code).toBe("DATA_ERROR");
    expect(JSON.stringify(data)).not.toContain("비밀 경로");
    errorLog.mockRestore();
  });

  it("AI 시간 초과는 504 AI_TIMEOUT", async () => {
    vi.mocked(requestAiPicks).mockRejectedValue(new AiTimeoutError());
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(lunch);
    expect(res.status).toBe(504);
    const data: ErrorResponse = await res.json();
    expect(data.error).toEqual({
      code: "AI_TIMEOUT",
      message: "추천이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
    });
    errorLog.mockRestore();
  });

  it("AI 호출 실패는 502 AI_ERROR (오류 원문은 화면에 내보내지 않음)", async () => {
    vi.mocked(requestAiPicks).mockRejectedValue(new AiError("AI 호출 실패 (HTTP 401): 원문"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(lunch);
    expect(res.status).toBe(502);
    const data: ErrorResponse = await res.json();
    expect(data.error.code).toBe("AI_ERROR");
    expect(JSON.stringify(data)).not.toContain("401");
    errorLog.mockRestore();
  });
});
