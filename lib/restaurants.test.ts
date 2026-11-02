// PLAN 작업 4 점검: 목록 읽기·형식 검사가 문제를 제대로 찾아내는지 확인한다.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRestaurants, RestaurantDataError, validateRestaurants } from "./restaurants";

const sample = {
  id: "r01",
  name: "(예시) 문현 국밥집",
  cuisine: "한식",
  pricePerPerson: 11000,
  walkMinutes: 5,
  maxCapacity: 30,
  hasRoom: false,
  roomCapacity: 0,
  groupSeating: false,
  reservation: "불가",
};

/** 검사 실패 시 문제 목록을 꺼낸다 (성공하면 시험 실패). */
function problemsOf(data: unknown): string[] {
  const result = validateRestaurants(data);
  if (result.ok) throw new Error("문제가 있어야 하는데 통과했습니다");
  return result.problems;
}

describe("실제 목록 파일", () => {
  it("data/restaurants.json이 형식에 맞는다", async () => {
    const list = await loadRestaurants();
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("validateRestaurants", () => {
  it("올바른 가게는 통과한다", () => {
    expect(validateRestaurants([sample])).toEqual({ ok: true, restaurants: [sample] });
  });

  it("도보 15분은 통과하고 16분은 막는다", () => {
    expect(validateRestaurants([{ ...sample, walkMinutes: 15 }]).ok).toBe(true);
    expect(problemsOf([{ ...sample, walkMinutes: 16 }])).toEqual([
      "1번째 가게(r01): 도보 시간은 15분 이하여야 합니다 (그보다 먼 가게는 목록에 넣지 않음)",
    ]);
  });

  it("숫자 칸에 글자를 넣으면 막는다", () => {
    expect(problemsOf([{ ...sample, pricePerPerson: "1만원" }])).toEqual([
      "1번째 가게(r01): 1인 가격은 숫자(원)여야 합니다",
    ]);
  });

  it("정해지지 않은 메뉴·예약 값을 막는다", () => {
    const problems = problemsOf([{ ...sample, cuisine: "피자", reservation: "몰라요" }]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("메뉴 종류는");
    expect(problems[1]).toContain("예약 여부는");
  });

  it("빈 이름과 빠진 항목을 막는다", () => {
    const { hasRoom: _omit, ...withoutRoom } = sample;
    void _omit;
    const problems = problemsOf([{ ...sample, name: "  " }, withoutRoom]);
    expect(problems).toEqual([
      "1번째 가게(r01): 가게 이름이 비어 있습니다",
      "2번째 가게(r01): 룸 여부는 true, false 또는 \"정보 없음\"이어야 합니다",
    ]);
  });

  it("룸 여부·룸 인원·최대 인원이 서로 맞지 않으면 막는다", () => {
    expect(validateRestaurants([{ ...sample, hasRoom: true, roomCapacity: 12 }]).ok).toBe(true);
    expect(problemsOf([{ ...sample, hasRoom: false, roomCapacity: 8 }])).toEqual([
      "1번째 가게(r01): 룸이 없으면 룸 인원은 0이어야 합니다",
    ]);
    expect(problemsOf([{ ...sample, hasRoom: true, roomCapacity: 0 }])).toEqual([
      "1번째 가게(r01): 룸이 있으면 룸 인원은 1명 이상 또는 \"정보 없음\"이어야 합니다",
    ]);
    expect(problemsOf([{ ...sample, hasRoom: true, roomCapacity: 40 }])).toEqual([
      "1번째 가게(r01): 룸 인원은 최대 인원보다 클 수 없습니다",
    ]);
  });

  it("최대 인원·룸·룸 인원·예약은 \"정보 없음\"을 적을 수 있다", () => {
    expect(validateRestaurants([{ ...sample, maxCapacity: "정보 없음" }]).ok).toBe(true);
    expect(validateRestaurants([{ ...sample, reservation: "정보 없음" }]).ok).toBe(true);
    expect(validateRestaurants([{ ...sample, hasRoom: "정보 없음", roomCapacity: "정보 없음" }]).ok).toBe(true);
    expect(validateRestaurants([{ ...sample, hasRoom: true, roomCapacity: "정보 없음" }]).ok).toBe(true);
    // 룸 인원을 알면 최대 인원이 "정보 없음"이어도 된다
    expect(validateRestaurants([{ ...sample, maxCapacity: "정보 없음", hasRoom: true, roomCapacity: 12 }]).ok).toBe(true);
  });

  it("가격·도보 시간은 \"정보 없음\"을 적을 수 없다 (예산·거리 조건에 꼭 필요)", () => {
    expect(problemsOf([{ ...sample, pricePerPerson: "정보 없음", walkMinutes: "정보 없음" }])).toEqual([
      "1번째 가게(r01): 1인 가격은 숫자(원)여야 합니다",
      "1번째 가게(r01): 도보 시간은 숫자(분)여야 합니다",
    ]);
  });

  it("\"정보 없음\"끼리 맞지 않거나 잘못 적은 값을 막는다", () => {
    expect(problemsOf([{ ...sample, hasRoom: "정보 없음", roomCapacity: 0 }])).toEqual([
      "1번째 가게(r01): 룸 여부가 \"정보 없음\"이면 룸 인원도 \"정보 없음\"이어야 합니다",
    ]);
    expect(problemsOf([{ ...sample, maxCapacity: "모름" }])[0]).toContain("최대 인원은 1 이상의 정수(명) 또는");
    expect(problemsOf([{ ...sample, maxCapacity: 0 }])[0]).toContain("최대 인원은 1 이상의 정수(명) 또는");
    expect(problemsOf([{ ...sample, groupSeating: "있음" }])).toEqual([
      "1번째 가게(r01): 단체석 표시 여부는 true 또는 false여야 합니다",
    ]);
  });

  it("출처(source)는 적어도 되고 안 적어도 된다", () => {
    expect(validateRestaurants([{ ...sample, source: "https://place.map.kakao.com/1" }]).ok).toBe(true);
  });

  it("오타 난 항목 이름을 막는다", () => {
    expect(problemsOf([{ ...sample, walkMinute: 5 }])[0]).toContain("정해지지 않은 항목");
  });

  it("고유 번호가 겹치면 막는다", () => {
    expect(problemsOf([sample, { ...sample, name: "다른 가게" }])).toEqual([
      "2번째 가게(r01): 고유 번호가 1번째 가게와 겹칩니다",
    ]);
  });

  it("문제를 하나만 찾고 멈추지 않고 모두 모은다", () => {
    const problems = problemsOf([
      { ...sample, id: "r01", walkMinutes: 20 },
      { ...sample, id: "r02" },
      { ...sample, id: "r03", maxCapacity: 0 },
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[1]).toMatch(/^3번째 가게\(r03\)/);
  });

  it("배열이 아니거나 비어 있으면 막는다", () => {
    expect(problemsOf({})).toEqual(["목록 파일은 [ ]로 감싼 배열이어야 합니다"]);
    expect(problemsOf([])).toEqual(["목록에 가게가 한 곳도 없습니다"]);
  });
});

describe("loadRestaurants", () => {
  it("JSON 문법이 틀리면 RestaurantDataError를 던진다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bifc-"));
    const file = join(dir, "broken.json");
    await writeFile(file, '[{"id": "r01",}]', "utf8");
    await expect(loadRestaurants(file)).rejects.toBeInstanceOf(RestaurantDataError);
  });

  it("파일이 없으면 RestaurantDataError를 던진다", async () => {
    await expect(loadRestaurants(join(tmpdir(), "없는-파일.json"))).rejects.toThrow(
      "목록 파일을 찾지 못했습니다",
    );
  });
});
