// PLAN 작업 9·11·12 점검: AI 답 검사·이유 규칙·다시 요청·3곳 채우기·기본 문장·안내 문구 (Design §2.2 처리 9~11, §3.4, §8.1 V1~V6)
import { describe, expect, it, vi } from "vitest";
import { filterCandidates } from "./filter";
import type { AiPick, FilterConditions, Restaurant } from "./types";
import {
  checkAiPicks,
  checkReason,
  chooseNotice,
  defaultReason,
  fillRecommendations,
  limitSameCuisine,
  NOTICES,
  pickWithRetry,
} from "./verify";

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
    groupSeating: true,
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

describe("checkReason (Design §3.4)", () => {
  const r = shop("a"); // 1인 25,000원, 도보 5분, 최대 20명, 룸 12명
  const ok = (reason: string, people = 10) => expect(checkReason(reason, r, people)).toEqual([]);
  const bad = (reason: string, word: string, people = 10) =>
    expect(checkReason(reason, r, people).join(" / ")).toContain(word);

  it("정해진 표기로 목록 값과 같은 숫자 2개 이상이면 통과", () => {
    ok("1인 25,000원, 도보 5분");
    ok("도보 5분, 룸 12명이라 10명 회식에 적합");
    ok("1인 25,000원, 최대 20명");
    ok("1인 25,000원, 도보 5분, 12명"); // 꾸밈말 없는 인원은 룸·최대·입력 인원 중 하나면 됨
  });

  it("V2: 숫자가 목록 값과 다르면 위반 (도보 3분 ↔ 실제 5분)", () => {
    bad("1인 25,000원, 도보 3분", "도보 시간이 목록 값과 다릅니다");
    bad("1인 20,000원, 도보 5분", "1인 가격이 목록 값과 다릅니다");
    bad("도보 5분, 최대 30명", "최대 인원이 목록 값과 다릅니다");
    bad("도보 5분, 룸 20명", "룸 인원이 목록 값과 다릅니다");
    bad("도보 5분, 7명", "인원 숫자가");
  });

  it("V3: 한글 숫자·어림 표현은 위반 (2만 원대, 2만 5천 원)", () => {
    bad("1인 2만 원대, 도보 5분", "한글 숫자");
    bad("1인 2만 5천 원, 도보 5분", "한글 숫자");
  });

  it("쉼표 없는 가격, 정해진 표기 밖 숫자도 위반", () => {
    bad("1인 25000원, 도보 5분", "1인 가격이 목록 값과 다릅니다");
    bad("도보 5분, 1인 25,000원, 평점 4.5", "밖의 숫자가 있습니다");
    bad("도보 5분, 25,000원", "숫자 항목이 2개 이상");
  });

  it("V4: 50자 초과·여러 줄·숫자 1개·빈 이유는 위반", () => {
    bad(`1인 25,000원, 도보 5분${"가".repeat(40)}`, "50자를 넘습니다");
    ok(`1인 25,000원, 도보 5분${"가".repeat(50 - "1인 25,000원, 도보 5분".length)}`); // 정확히 50자는 통과
    bad("1인 25,000원,\n도보 5분", "한 줄이 아닙니다");
    bad("도보 5분이라 가까움", "숫자 항목이 2개 이상");
    bad("", "비어 있습니다");
  });

  it("코드가 만든 기본 문장은 항상 규칙을 지킨다", () => {
    for (const s of [shop("x"), shop("y", { pricePerPerson: 200000, walkMinutes: 15, maxCapacity: 999, roomCapacity: 0, hasRoom: false })]) {
      expect(checkReason(defaultReason(s, conditions), s, conditions.people)).toEqual([]);
      expect(checkReason(defaultReason(s, { ...conditions, needRoom: true }), s, conditions.people)).toEqual([]);
    }
  });
});

describe("limitSameCuisine", () => {
  it("V5: 같은 메뉴 3곳이면 AI 순서상 3번째를 뺀다", () => {
    const recs = ["a", "b", "c"].map((id) => ({ ...shop(id), reason: "x" }));
    const { recommendations, problems } = limitSameCuisine(recs);
    expect(recommendations.map((r) => r.id)).toEqual(["a", "b"]);
    expect(problems).toHaveLength(1);
  });
});

describe("pickWithRetry", () => {
  const candidates = [
    shop("k1"),
    shop("k2", { walkMinutes: 6 }),
    shop("k3", { walkMinutes: 7 }),
    shop("j1", { cuisine: "중식", walkMinutes: 8, pricePerPerson: 18000 }),
  ];
  const good = (id: string) => {
    const s = candidates.find((c) => c.id === id)!;
    return { id, reason: defaultReason(s, conditions) };
  };

  it("첫 답이 규칙을 모두 지키면 다시 요청하지 않는다", async () => {
    const ask = vi.fn().mockResolvedValue([good("k1"), good("j1"), good("k2")]);
    const result = await pickWithRetry(ask, candidates, conditions);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.recommendations.map((r) => r.id)).toEqual(["k1", "j1", "k2"]);
  });

  it("첫 답에 문제가 있으면 문제를 알려 주며 1회 다시 요청하고, 고친 답을 쓴다", async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce([{ id: "k1", reason: "도보 3분, 1인 25,000원" }, good("k2"), good("k3")])
      .mockResolvedValueOnce([good("k1"), good("j1"), good("k2")]);
    const result = await pickWithRetry(ask, candidates, conditions);
    expect(ask).toHaveBeenCalledTimes(2);
    const feedback: string = ask.mock.calls[1][0];
    expect(feedback).toContain("도보 시간이 목록 값과 다릅니다");
    expect(feedback).toContain("같은 메뉴(한식)");
    expect(result.retried).toBe(true);
    expect(result.recommendations.map((r) => r.id)).toEqual(["k1", "j1", "k2"]);
    expect(result.problems).toEqual([]);
  });

  it("다시 요청해도 어기면: 이유는 기본 문장, 같은 메뉴 3번째는 빼고, 빈자리는 후보에서 채운다", async () => {
    const badAnswer = [
      { id: "k1", reason: "1인 2만 원대, 맛집" },
      good("k2"),
      good("k3"),
    ];
    const ask = vi.fn().mockResolvedValue(badAnswer);
    const result = await pickWithRetry(ask, candidates, conditions);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.recommendations.map((r) => [r.id, r.reason])).toEqual([
      ["k1", "1인 25,000원, 도보 5분, 최대 20명"],
      ["k2", good("k2").reason],
      ["j1", "1인 18,000원, 도보 8분, 최대 20명"],
    ]);
    // 최종 결과는 모든 규칙을 지킨다
    for (const r of result.recommendations) expect(checkReason(r.reason, r, conditions.people)).toEqual([]);
  });

  it("지어낸 가게만 고르면 다시 요청 후에도 후보에서 채워 3곳을 만든다", async () => {
    const ask = vi.fn().mockResolvedValue([{ id: "가짜", reason: "x" }]);
    const result = await pickWithRetry(ask, candidates, conditions);
    expect(result.recommendations.map((r) => r.id)).toEqual(["k1", "k2", "j1"]);
  });

  it("다시 요청이 실패하면 첫 답을 보정해서 쓴다", async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce([{ id: "j1", reason: "너무 긴 이유".repeat(10) }, good("k1")])
      .mockRejectedValueOnce(new Error("AI 실패"));
    const result = await pickWithRetry(ask, candidates, conditions);
    expect(result.recommendations.map((r) => r.id)).toEqual(["j1", "k1", "k2"]);
    expect(result.recommendations[0].reason).toBe("1인 18,000원, 도보 8분, 최대 20명");
  });

  it("첫 요청이 실패하면 오류를 그대로 던진다 (화면 오류 안내는 API가 맡음)", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("AI 실패"));
    await expect(pickWithRetry(ask, candidates, conditions)).rejects.toThrow("AI 실패");
  });

  it("후보가 2곳이면 2곳을 고른 답에 문제가 없다고 본다", async () => {
    const two = candidates.slice(2);
    const ask = vi.fn().mockResolvedValue([good("k3"), good("j1")]);
    const result = await pickWithRetry(ask, two, conditions);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.recommendations).toHaveLength(2);
  });
});

describe("\"정보 없음\" 가게의 기본 문장·이유 검사", () => {
  const unknown = shop("u", { maxCapacity: "정보 없음", hasRoom: true, roomCapacity: "정보 없음", groupSeating: true });

  it("인원 숫자 대신 확인된 표시를 쓴다", () => {
    expect(defaultReason(unknown, conditions)).toBe("1인 25,000원, 도보 5분, 단체석 있음");
    expect(defaultReason(unknown, { ...conditions, needRoom: true })).toBe("1인 25,000원, 도보 5분, 룸 있음");
    const plain = shop("p", { maxCapacity: "정보 없음", hasRoom: "정보 없음", roomCapacity: "정보 없음", groupSeating: false });
    expect(defaultReason(plain, conditions)).toBe("1인 25,000원, 도보 5분");
  });

  it("기본 문장은 '정보 없음' 가게에서도 이유 규칙을 지킨다", () => {
    expect(checkReason(defaultReason(unknown, conditions), unknown, conditions.people)).toEqual([]);
  });

  it("AI가 모르는 인원을 숫자로 지어내면 위반", () => {
    expect(checkReason("1인 25,000원, 도보 5분, 최대 30명", unknown, 10).join()).toContain("최대 인원이 목록 값과 다릅니다");
    expect(checkReason("1인 25,000원, 도보 5분, 룸 12명", unknown, 10).join()).toContain("룸 인원이 목록 값과 다릅니다");
    expect(checkReason("1인 25,000원, 도보 5분, 10명 회식", unknown, 10)).toEqual([]); // 입력 인원은 괜찮음
  });
});
