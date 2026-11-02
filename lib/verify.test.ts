// PLAN 작업 9·11 점검: AI 답 검사·3곳 채우기·기본 문장·안내 문구 (Design §2.2 처리 9~11, §8.1 V1·V6)
import { describe, expect, it } from "vitest";
import { filterCandidates } from "./filter";
import type { AiPick, FilterConditions, Restaurant } from "./types";
import { checkAiPicks, chooseNotice, defaultReason, fillRecommendations, NOTICES } from "./verify";

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

describe("checkAiPicks (가짜 AI 답)", () => {
  const candidates = [shop("a"), shop("b", { cuisine: "중식" }), shop("c", { cuisine: "일식" }), shop("d")];

  it("올바른 답은 AI가 매긴 순서 그대로, 이유를 붙여 통과시킨다", () => {
    const picks: AiPick[] = [
      { id: "c", reason: "이유 c" },
      { id: "a", reason: "이유 a" },
      { id: "b", reason: "이유 b" },
    ];
    const { recommendations, problems } = checkAiPicks(picks, candidates);
    expect(recommendations.map((r) => [r.id, r.reason])).toEqual([
      ["c", "이유 c"],
      ["a", "이유 a"],
      ["b", "이유 b"],
    ]);
    expect(problems).toEqual([]);
  });

  it("V1: 목록에는 있지만 조건에서 걸러진 가게(예산 초과)를 고르면 뺀다", () => {
    const list = [shop("cheap"), shop("expensive", { pricePerPerson: 50000 })];
    const filtered = filterCandidates(list, conditions); // 예산 30,000원 → expensive 제외
    const { recommendations, problems } = checkAiPicks(
      [
        { id: "expensive", reason: "비싸지만 맛있음" },
        { id: "cheap", reason: "가성비" },
      ],
      filtered,
    );
    expect(recommendations.map((r) => r.id)).toEqual(["cheap"]);
    expect(problems).toEqual(["후보에 없는 가게를 골랐습니다: expensive"]);
  });

  it("목록 어디에도 없는 지어낸 가게를 뺀다", () => {
    const { recommendations, problems } = checkAiPicks([{ id: "가짜맛집", reason: "최고" }], candidates);
    expect(recommendations).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("V6: AI가 값을 바꿔 보내도 화면 값은 후보(목록) 값이다", () => {
    const tampered = {
      id: "a",
      reason: "이유",
      name: "바뀐 이름",
      pricePerPerson: 1000,
      walkMinutes: 1,
      maxCapacity: 999,
      reservation: "가능",
    } as AiPick;
    const [result] = checkAiPicks([tampered], candidates).recommendations;
    expect(result).toEqual({ ...shop("a"), reason: "이유" });
  });

  it("같은 가게를 두 번 고르면 처음 것만 남긴다", () => {
    const { recommendations, problems } = checkAiPicks(
      [
        { id: "a", reason: "첫 번째" },
        { id: "a", reason: "두 번째" },
      ],
      candidates,
    );
    expect(recommendations.map((r) => r.reason)).toEqual(["첫 번째"]);
    expect(problems).toEqual(["같은 가게를 두 번 골랐습니다: a"]);
  });

  it("3곳보다 많이 고르면 앞의 3곳만 남긴다", () => {
    const picks = ["a", "b", "c", "d"].map((id) => ({ id, reason: `이유 ${id}` }));
    const { recommendations, problems } = checkAiPicks(picks, candidates);
    expect(recommendations.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(problems).toEqual(["3곳보다 많이 골랐습니다: d"]);
  });

  it("이유 앞뒤 공백을 지운다", () => {
    const [result] = checkAiPicks([{ id: "a", reason: "  이유 \n" }], candidates).recommendations;
    expect(result.reason).toBe("이유");
  });

  it("검사 후 모자라면 fillRecommendations로 후보에서 채울 수 있다 (V1 이어서)", () => {
    const { recommendations } = checkAiPicks([{ id: "가짜", reason: "x" }, { id: "b", reason: "이유 b" }], candidates);
    const filled = fillRecommendations(recommendations, candidates, conditions);
    expect(filled.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});
