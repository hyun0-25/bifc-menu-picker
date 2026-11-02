// PLAN 작업 9 점검: 3곳 채우기·기본 문장·안내 문구 (Design §2.2 처리 10·11)
import { describe, expect, it } from "vitest";
import type { FilterConditions, Restaurant } from "./types";
import { chooseNotice, defaultReason, fillRecommendations, NOTICES } from "./verify";

function shop(id: string, overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id,
    name: `시험 가게 ${id}`,
    cuisine: "한식",
    pricePerPerson: 25000,
    walkMinutes: 5,
    maxCapacity: 20,
    hasRoom: true,
    roomCapacity: 12,
    reservation: "가능",
    ...overrides,
  };
}

const conditions: FilterConditions = {
  purpose: "dinner",
  people: 10,
  budget: 30000,
  needRoom: false,
  needReservation: false,
};

describe("defaultReason", () => {
  it("목록 값으로 '1인 가격, 도보, 최대 인원' 문장을 만든다", () => {
    expect(defaultReason(shop("a"), conditions)).toBe("1인 25,000원, 도보 5분, 최대 20명");
  });

  it("룸이 필요하면 최대 인원 대신 룸 인원을 쓴다", () => {
    expect(defaultReason(shop("a"), { ...conditions, needRoom: true })).toBe(
      "1인 25,000원, 도보 5분, 룸 12명",
    );
  });

  it("가장 긴 값이어도 50자를 넘지 않는다", () => {
    const big = shop("a", { pricePerPerson: 200000, walkMinutes: 15, maxCapacity: 999 });
    expect(defaultReason(big, conditions).length).toBeLessThanOrEqual(50);
  });
});

describe("fillRecommendations", () => {
  it("후보 순서대로 3곳을 채운다", () => {
    const candidates = [shop("a"), shop("b", { cuisine: "중식" }), shop("c", { cuisine: "일식" }), shop("d")];
    expect(fillRecommendations([], candidates, conditions).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("같은 메뉴는 2곳까지만 넣고 다음 메뉴로 넘어간다", () => {
    const candidates = [shop("a"), shop("b"), shop("c"), shop("d", { cuisine: "양식" })];
    expect(fillRecommendations([], candidates, conditions).map((r) => r.id)).toEqual(["a", "b", "d"]);
  });

  it("후보가 모두 같은 메뉴면 2곳만 돌려준다", () => {
    const candidates = [shop("a"), shop("b"), shop("c")];
    expect(fillRecommendations([], candidates, conditions)).toHaveLength(2);
  });

  it("이미 고른 가게는 그대로 두고 겹치지 않게 나머지를 채운다", () => {
    const picked = [{ ...shop("b", { cuisine: "중식" }), reason: "AI가 쓴 이유" }];
    const candidates = [shop("a"), shop("b", { cuisine: "중식" }), shop("c", { cuisine: "일식" })];
    const result = fillRecommendations(picked, candidates, conditions);
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result[0].reason).toBe("AI가 쓴 이유");
    expect(result[1].reason).toBe("1인 25,000원, 도보 5분, 최대 20명");
  });

  it("후보가 없으면 빈 목록", () => {
    expect(fillRecommendations([], [], conditions)).toEqual([]);
  });
});

describe("chooseNotice", () => {
  it("후보 0곳: 지어내지 않고 완화 안내", () => {
    expect(chooseNotice(0, 0)).toBe(NOTICES.none);
  });

  it("후보 1~2곳: 완화 안내", () => {
    expect(chooseNotice(2, 2)).toBe(NOTICES.fewCandidates);
  });

  it("후보 3곳 이상인데 메뉴 규칙 때문에 모자람: 메뉴 안내 (완화 안내 아님)", () => {
    expect(chooseNotice(5, 2)).toBe(NOTICES.cuisineLimited);
  });

  it("3곳 다 채움: 안내 없음", () => {
    expect(chooseNotice(5, 3)).toBeUndefined();
  });
});
