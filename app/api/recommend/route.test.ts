// PLAN 작업 9 점검: POST /api/recommend가 입력 검사 → 목록 → 필터 → 결과를 정해진 모양으로 돌려주는지 확인
// 실제 목록 파일은 바뀌므로, 목록 읽기를 고정된 시험용 가게 3곳으로 바꿔 끼워 시험한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRestaurants, RestaurantDataError } from "@/lib/restaurants";
import type { ErrorResponse, RecommendResponse, Restaurant } from "@/lib/types";
import { NOTICES } from "@/lib/verify";
import { POST } from "./route";

vi.mock("@/lib/restaurants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/restaurants")>()),
  loadRestaurants: vi.fn(),
}));

const shops: Restaurant[] = [
  { id: "s1", name: "시험 국밥", cuisine: "한식", pricePerPerson: 11000, walkMinutes: 5, maxCapacity: 30, hasRoom: false, roomCapacity: 0, reservation: "불가" },
  { id: "s2", name: "시험 중식", cuisine: "중식", pricePerPerson: 25000, walkMinutes: 8, maxCapacity: 20, hasRoom: true, roomCapacity: 12, reservation: "가능" },
  { id: "s3", name: "시험 스시", cuisine: "일식", pricePerPerson: 18000, walkMinutes: 12, maxCapacity: 8, hasRoom: false, roomCapacity: 0, reservation: "정보 없음" },
];

beforeEach(() => {
  vi.mocked(loadRestaurants).mockResolvedValue(shops);
});

function call(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/api/recommend", { method: "POST", body: text }));
}

const lunch = { purpose: "lunch", people: 2, budget: 30000 };

describe("POST /api/recommend", () => {
  it("정상 요청이면 200과 조건에 맞는 가게를 가까운 순으로 돌려준다", async () => {
    const res = await call(lunch);
    expect(res.status).toBe(200);
    const data: RecommendResponse = await res.json();
    // 점심 기본 거리 10분 → s3(12분) 제외, 후보 2곳이라 완화 안내
    expect(data.recommendations.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(data.notice).toBe(NOTICES.fewCandidates);
    expect(data.recommendations[0]).toEqual({ ...shops[0], reason: "1인 11,000원, 도보 5분, 최대 30명" });
  });

  it("후보가 3곳이면 3곳을 돌려주고 안내가 없다", async () => {
    const data: RecommendResponse = await (await call({ ...lunch, purpose: "dinner" })).json();
    expect(data.recommendations.map((r) => r.id)).toEqual(["s1", "s2", "s3"]);
    expect(data.notice).toBeUndefined();
  });

  it("맞는 곳이 없으면 200, 빈 목록과 완화 안내 (점검표 #3)", async () => {
    const res = await call({ purpose: "dinner", people: 30, budget: 5000, needRoom: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recommendations: [], notice: NOTICES.none });
  });

  it("회식 + 룸 + 예약: 룸 인원·예약 가능 가게만, 이유는 룸 인원 기준 (점검표 #4)", async () => {
    const data: RecommendResponse = await (
      await call({ purpose: "dinner", people: 12, budget: 30000, needRoom: true, needReservation: true })
    ).json();
    expect(data.recommendations.map((r) => [r.id, r.reason])).toEqual([
      ["s2", "1인 25,000원, 도보 8분, 룸 12명"],
    ]);
  });

  it("입력이 잘못되면 400과 칸별 안내 (점검표 #2·#6)", async () => {
    const res = await call({ ...lunch, people: 0, budget: 1000 });
    expect(res.status).toBe(400);
    const data: ErrorResponse = await res.json();
    expect(data.error.code).toBe("INVALID_INPUT");
    expect(Object.keys(data.error.fields ?? {}).sort()).toEqual(["budget", "people"]);
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
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
