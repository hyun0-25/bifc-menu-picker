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
      "2번째 가게(r01): 룸 여부는 true 또는 false여야 합니다",
    ]);
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
