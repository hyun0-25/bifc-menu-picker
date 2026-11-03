// 추가 조건(자연어) API 점검: 입력 검사 → AI 전달 → 근거 메뉴 검증 → 응답 (가짜 AI 사용)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestAiPicks } from "@/lib/ai";
import { loadRestaurants } from "@/lib/restaurants";
import type { ErrorResponse, RecommendResponse, Restaurant } from "@/lib/types";
import { POST } from "./route";

vi.mock("@/lib/restaurants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/restaurants")>()),
  loadRestaurants: vi.fn(),
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  requestAiPicks: vi.fn(),
}));

const shop = (id: string, cuisine: Restaurant["cuisine"], menus: string[], walk: number): Restaurant => ({
  id,
  name: `시험 ${id}`,
  cuisine,
  menus,
  pricePerPerson: 9000,
  walkMinutes: walk,
  maxCapacity: "정보 없음",
  hasRoom: "정보 없음",
  roomCapacity: "정보 없음",
  groupSeating: false,
  reservation: "정보 없음",
});

const shops = [
  shop("s1", "중식", ["짬뽕", "짜장면"], 3),
  shop("s2", "한식", ["된장찌개", "김치찌개"], 5),
  shop("s3", "일식", ["우동", "돈까스"], 7),
];

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));

const lunch = { purpose: "lunch", people: 2, budget: 30000 };

beforeEach(() => {
  vi.mocked(loadRestaurants).mockResolvedValue(shops);
  vi.mocked(requestAiPicks).mockReset();
});

describe("POST /api/recommend — 추가 조건", () => {
  it("정리된 추가 조건이 AI 요청에 전달된다", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([
      { id: "s1", reason: "1인 9,000원, 도보 3분", matchedMenus: ["짬뽕"] },
      { id: "s2", reason: "1인 9,000원, 도보 5분", matchedMenus: [] },
      { id: "s3", reason: "1인 9,000원, 도보 7분" },
    ]);
    const res = await call({ ...lunch, extra: "  매콤한,\n느끼하지   않은 " });
    expect(res.status).toBe(200);
    expect(vi.mocked(requestAiPicks).mock.calls[0][0].extra).toBe("매콤한, 느끼하지 않은");
  });

  it("근거 메뉴는 그 가게 메뉴에 있는 것만 응답에 실린다 (지어낸 메뉴는 버림)", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([
      { id: "s1", reason: "1인 9,000원, 도보 3분", matchedMenus: ["짬뽕", "마라탕"] },
      { id: "s2", reason: "1인 9,000원, 도보 5분", matchedMenus: ["짬뽕"] },
      { id: "s3", reason: "1인 9,000원, 도보 7분" },
    ]);
    const data: RecommendResponse = await (await call({ ...lunch, extra: "매콤한" })).json();
    const byId = Object.fromEntries(data.recommendations.map((r) => [r.id, r]));
    expect(byId.s1.matchedMenus).toEqual(["짬뽕"]);
    expect("matchedMenus" in byId.s2).toBe(false);
    expect("matchedMenus" in byId.s3).toBe(false);
  });

  it("추가 조건이 후보를 줄이지 않는다 (필터가 아니라 참고 기준)", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([]);
    await call({ ...lunch, extra: "매콤한" });
    expect(vi.mocked(requestAiPicks).mock.calls[0][1].map((c) => c.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("추가 조건이 없으면 extra 없이 AI를 부른다", async () => {
    vi.mocked(requestAiPicks).mockResolvedValue([]);
    await call(lunch);
    expect(vi.mocked(requestAiPicks).mock.calls[0][0].extra).toBeUndefined();
  });

  it("개인정보 모양·너무 긴 문장은 400이고 AI는 부르지 않는다", async () => {
    for (const extra of ["010-1234-5678", "가".repeat(61)]) {
      const res = await call({ ...lunch, extra });
      expect(res.status).toBe(400);
      const data: ErrorResponse = await res.json();
      expect(Object.keys(data.error.fields ?? {})).toEqual(["extra"]);
    }
    expect(requestAiPicks).not.toHaveBeenCalled();
  });
});
