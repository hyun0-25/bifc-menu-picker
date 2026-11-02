// PLAN 작업 6 점검: 필터가 PRD must ① 규칙 3~6대로 거르는지 확인한다 (Plan SC: SC-2 조건 준수 100%)
// 실제 목록 파일은 계속 바뀌므로, 여기서는 값을 고정한 시험용 가게를 쓴다.
import { describe, expect, it } from "vitest";
import { filterCandidates, matchesConditions, resolveMaxWalkMinutes } from "./filter";
import type { FilterConditions, Restaurant } from "./types";

function shop(id: string, overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id,
    name: `시험 가게 ${id}`,
    cuisine: "한식",
    pricePerPerson: 15000,
    walkMinutes: 5,
    maxCapacity: 20,
    hasRoom: false,
    roomCapacity: 0,
    groupSeating: false,
    reservation: "가능",
    ...overrides,
  };
}

const lunch: FilterConditions = {
  purpose: "lunch",
  people: 4,
  budget: 15000,
  needRoom: false,
  needReservation: false,
};

const dinner: FilterConditions = { ...lunch, purpose: "dinner" };

describe("규칙 3: 1인 예산", () => {
  it("가격이 예산과 같으면 남기고, 1원이라도 넘으면 뺀다", () => {
    expect(matchesConditions(shop("a", { pricePerPerson: 15000 }), lunch)).toBe(true);
    expect(matchesConditions(shop("b", { pricePerPerson: 15001 }), lunch)).toBe(false);
  });
});

describe("규칙 4: 인원과 룸", () => {
  it("최대 인원이 입력 인원과 같으면 남기고, 적으면 뺀다", () => {
    expect(matchesConditions(shop("a", { maxCapacity: 4 }), lunch)).toBe(true);
    expect(matchesConditions(shop("b", { maxCapacity: 3 }), lunch)).toBe(false);
  });

  it("룸이 필요하면 룸 없는 가게를 뺀다", () => {
    expect(matchesConditions(shop("a"), { ...dinner, needRoom: true })).toBe(false);
  });

  it("룸이 있어도 룸 인원이 모자라면 뺀다 (가게 전체 인원은 충분해도)", () => {
    const conditions = { ...dinner, people: 15, needRoom: true };
    const room = { hasRoom: true, maxCapacity: 30 };
    expect(matchesConditions(shop("a", { ...room, roomCapacity: 15 }), conditions)).toBe(true);
    expect(matchesConditions(shop("b", { ...room, roomCapacity: 14 }), conditions)).toBe(false);
  });

  it("룸이 필요 없으면 룸 여부와 관계없이 남긴다", () => {
    const withRoom = shop("a", { hasRoom: true, roomCapacity: 2 });
    expect(matchesConditions(withRoom, dinner)).toBe(true);
    expect(matchesConditions(shop("b"), dinner)).toBe(true);
  });
});

describe("규칙 5: 예약", () => {
  it("예약이 필요하면 '가능'만 남기고 '불가'·'정보 없음'은 뺀다", () => {
    const conditions = { ...dinner, needReservation: true };
    expect(matchesConditions(shop("a", { reservation: "가능" }), conditions)).toBe(true);
    expect(matchesConditions(shop("b", { reservation: "불가" }), conditions)).toBe(false);
    expect(matchesConditions(shop("c", { reservation: "정보 없음" }), conditions)).toBe(false);
  });

  it("예약이 필요 없으면 예약 여부와 관계없이 남긴다", () => {
    expect(matchesConditions(shop("a", { reservation: "불가" }), dinner)).toBe(true);
    expect(matchesConditions(shop("b", { reservation: "정보 없음" }), dinner)).toBe(true);
  });
});

describe("규칙 6: 도보 거리", () => {
  it("거리를 비우면 점심 10분, 회식 15분을 쓴다", () => {
    expect(resolveMaxWalkMinutes(lunch)).toBe(10);
    expect(resolveMaxWalkMinutes(dinner)).toBe(15);
  });

  it("입력한 거리가 있으면 기본값 대신 그 값을 쓴다", () => {
    expect(resolveMaxWalkMinutes({ ...dinner, maxWalkMinutes: 5 })).toBe(5);
  });

  it("점심 기본값: 10분은 남기고 11분은 뺀다", () => {
    expect(matchesConditions(shop("a", { walkMinutes: 10 }), lunch)).toBe(true);
    expect(matchesConditions(shop("b", { walkMinutes: 11 }), lunch)).toBe(false);
  });

  it("회식 기본값: 11분 가게도 남는다", () => {
    expect(matchesConditions(shop("a", { walkMinutes: 11 }), dinner)).toBe(true);
  });

  it("입력한 거리와 같으면 남기고, 넘으면 뺀다", () => {
    const conditions = { ...dinner, maxWalkMinutes: 7 };
    expect(matchesConditions(shop("a", { walkMinutes: 7 }), conditions)).toBe(true);
    expect(matchesConditions(shop("b", { walkMinutes: 8 }), conditions)).toBe(false);
  });
});

describe("filterCandidates", () => {
  const list = [
    shop("far", { walkMinutes: 9 }),
    shop("expensive", { pricePerPerson: 30000 }),
    shop("near", { walkMinutes: 2 }),
    shop("mid1", { walkMinutes: 6 }),
    shop("mid2", { walkMinutes: 6 }),
  ];

  it("조건에 맞는 가게만 가까운 순으로 남긴다 (도보 시간이 같으면 목록 순서)", () => {
    expect(filterCandidates(list, lunch).map((r) => r.id)).toEqual(["near", "mid1", "mid2", "far"]);
  });

  it("여러 조건을 한꺼번에 적용한다", () => {
    const strict: FilterConditions = {
      purpose: "dinner",
      people: 10,
      budget: 30000,
      maxWalkMinutes: 10,
      needRoom: true,
      needReservation: true,
    };
    const shops = [
      shop("ok", { hasRoom: true, roomCapacity: 10, pricePerPerson: 30000 }),
      shop("small-room", { hasRoom: true, roomCapacity: 8 }),
      shop("no-reservation", { hasRoom: true, roomCapacity: 12, reservation: "정보 없음" }),
      shop("too-far", { hasRoom: true, roomCapacity: 12, walkMinutes: 11 }),
      shop("too-expensive", { hasRoom: true, roomCapacity: 12, pricePerPerson: 30001 }),
    ];
    expect(filterCandidates(shops, strict).map((r) => r.id)).toEqual(["ok"]);
  });

  it("맞는 가게가 없으면 빈 목록을 돌려준다", () => {
    expect(filterCandidates(list, { ...lunch, budget: 5000 })).toEqual([]);
  });

  it("원래 목록의 순서를 바꾸지 않는다", () => {
    const before = list.map((r) => r.id);
    filterCandidates(list, lunch);
    expect(list.map((r) => r.id)).toEqual(before);
  });
});

describe("\"정보 없음\" 처리 (Design §3.1)", () => {
  const unknownCap = { maxCapacity: "정보 없음" as const };

  it("최대 인원을 모르면 4명까지는 통과, 5명부터는 뺀다", () => {
    expect(matchesConditions(shop("a", unknownCap), { ...lunch, people: 4 })).toBe(true);
    expect(matchesConditions(shop("b", unknownCap), { ...dinner, people: 5 })).toBe(false);
  });

  it("최대 인원을 몰라도 단체석·룸 표시가 있으면 5명 이상도 통과", () => {
    expect(matchesConditions(shop("a", { ...unknownCap, groupSeating: true }), { ...dinner, people: 20 })).toBe(true);
    const room = { ...unknownCap, hasRoom: true as const, roomCapacity: "정보 없음" as const };
    expect(matchesConditions(shop("b", room), { ...dinner, people: 12 })).toBe(true);
  });

  it("룸이 필요하면 룸이 확인된 가게만 통과 (룸 여부 '정보 없음'은 뺀다)", () => {
    const conditions = { ...dinner, people: 10, needRoom: true };
    const unknownRoom = { hasRoom: "정보 없음" as const, roomCapacity: "정보 없음" as const, groupSeating: true };
    expect(matchesConditions(shop("a", unknownRoom), conditions)).toBe(false);
  });

  it("룸이 확인됐지만 룸 인원을 모르면 통과, 룸 인원을 알면 숫자로 비교", () => {
    const conditions = { ...dinner, people: 10, needRoom: true };
    expect(matchesConditions(shop("a", { hasRoom: true, roomCapacity: "정보 없음" }), conditions)).toBe(true);
    expect(matchesConditions(shop("b", { hasRoom: true, roomCapacity: 8 }), conditions)).toBe(false);
  });

  it("최대 인원을 알면 단체석 표시와 관계없이 숫자로 비교한다", () => {
    expect(matchesConditions(shop("a", { maxCapacity: 6, groupSeating: true }), { ...dinner, people: 8 })).toBe(false);
  });
});
