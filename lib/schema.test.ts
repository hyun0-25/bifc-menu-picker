// PLAN 작업 8·17 점검: 서버와 화면이 입력 조건을 범위·선택지대로 검사하는지 확인한다 (Design §3.2, §8.1 #2·#6)
import { describe, expect, it } from "vitest";
import { parseRecommendRequest, validateFormValues, type FormValues } from "./schema";

const valid = {
  purpose: "dinner",
  people: 10,
  budget: 30000,
  cuisines: ["한식", "고기"],
  maxWalkMinutes: 10,
  needRoom: true,
  needReservation: true,
};

/** 검사 실패 시 칸별 안내를 꺼낸다 (통과하면 시험 실패). */
function fieldsOf(body: unknown): Record<string, string> {
  const result = parseRecommendRequest(body);
  if (result.ok) throw new Error("실패해야 하는데 통과했습니다");
  return result.fields;
}

describe("올바른 요청", () => {
  it("모든 칸이 맞으면 그대로 통과한다", () => {
    expect(parseRecommendRequest(valid)).toEqual({ ok: true, request: { ...valid, travelMode: "walk" } });
  });

  it("선택 칸을 비우면 기본값을 채운다 (메뉴 상관없음, 거리 기본값, 룸·예약 불필요)", () => {
    const result = parseRecommendRequest({ purpose: "lunch", people: 2, budget: 10000 });
    expect(result).toEqual({
      ok: true,
      request: {
        purpose: "lunch",
        people: 2,
        budget: 10000,
        cuisines: [],
        maxWalkMinutes: undefined,
        travelMode: "walk",
        needRoom: false,
        needReservation: false,
      },
    });
  });

  it("도보 거리에 null을 보내면 비운 것으로 본다", () => {
    const result = parseRecommendRequest({ ...valid, maxWalkMinutes: null });
    expect(result.ok && result.request.maxWalkMinutes).toBeUndefined();
  });

  it("점심이면 룸 체크는 무시하고 예약 체크는 그대로 둔다", () => {
    const result = parseRecommendRequest({ ...valid, purpose: "lunch" });
    expect(result.ok && [result.request.needRoom, result.request.needReservation]).toEqual([
      false,
      true,
    ]);
  });

  it("같은 메뉴를 두 번 보내면 한 번으로 친다", () => {
    const result = parseRecommendRequest({ ...valid, cuisines: ["한식", "한식", "중식"] });
    expect(result.ok && result.request.cuisines).toEqual(["한식", "중식"]);
  });
});

describe("범위 경계", () => {
  it("인원 1명·30명은 통과하고 0명·31명은 막는다 (점검표 #2)", () => {
    expect(parseRecommendRequest({ ...valid, people: 1 }).ok).toBe(true);
    expect(parseRecommendRequest({ ...valid, people: 30 }).ok).toBe(true);
    expect(fieldsOf({ ...valid, people: 0 })).toEqual({ people: "1~30명 사이로 입력해 주세요" });
    expect(fieldsOf({ ...valid, people: 31 }).people).toBeDefined();
  });

  it("예산 5,000원·200,000원은 통과하고 1,000원은 막는다 (점검표 #6)", () => {
    expect(parseRecommendRequest({ ...valid, budget: 5000 }).ok).toBe(true);
    expect(parseRecommendRequest({ ...valid, budget: 200000 }).ok).toBe(true);
    expect(fieldsOf({ ...valid, budget: 1000 })).toEqual({
      budget: "5,000~200,000원 사이로 입력해 주세요",
    });
  });

  it("도보 거리 1분·15분은 통과하고 0분·16분은 막는다", () => {
    expect(parseRecommendRequest({ ...valid, maxWalkMinutes: 1 }).ok).toBe(true);
    expect(parseRecommendRequest({ ...valid, maxWalkMinutes: 15 }).ok).toBe(true);
    expect(fieldsOf({ ...valid, maxWalkMinutes: 0 }).maxWalkMinutes).toBeDefined();
    expect(fieldsOf({ ...valid, maxWalkMinutes: 16 }).maxWalkMinutes).toBeDefined();
  });

  it("소수(2.5명, 7.5분)는 막는다", () => {
    expect(fieldsOf({ ...valid, people: 2.5, maxWalkMinutes: 7.5 })).toEqual({
      people: "1~30명 사이로 입력해 주세요",
      maxWalkMinutes: "도보 거리는 1~15분 사이로 입력해 주세요 (비우면 기본값)",
    });
  });
});

describe("잘못된 값", () => {
  it("필수 칸(목적·인원·예산)이 비면 칸마다 알려 준다", () => {
    expect(Object.keys(fieldsOf({})).sort()).toEqual(["budget", "people", "purpose"]);
  });

  it("숫자 칸에 글자를 넣으면 막는다", () => {
    expect(fieldsOf({ ...valid, people: "10", budget: "3만원" })).toEqual({
      people: "1~30명 사이로 입력해 주세요",
      budget: "5,000~200,000원 사이로 입력해 주세요",
    });
  });

  it("정해지지 않은 목적·메뉴를 막는다", () => {
    expect(fieldsOf({ ...valid, purpose: "breakfast" }).purpose).toContain("점심 약속 또는 팀 회식");
    expect(fieldsOf({ ...valid, cuisines: ["피자"] }).cuisines).toContain("정해진 메뉴");
  });

  it("룸·예약 칸에 참/거짓이 아닌 값을 막는다", () => {
    expect(Object.keys(fieldsOf({ ...valid, needRoom: "yes", needReservation: 1 }))).toEqual([
      "needRoom",
      "needReservation",
    ]);
  });

  it("정해지지 않은 항목(이름·연락처 등)이 오면 막는다", () => {
    expect(fieldsOf({ ...valid, name: "홍길동", phone: "010" })).toEqual({
      form: "정해지지 않은 항목이 들어 있습니다",
    });
  });

  it("요청이 객체가 아니면 막는다", () => {
    expect(fieldsOf("hello").form).toBeDefined();
    expect(fieldsOf(null).form).toBeDefined();
    expect(fieldsOf([valid]).form).toBeDefined();
  });
});

describe("validateFormValues (화면 입력)", () => {
  const form: FormValues = {
    purpose: "dinner",
    travelMode: "walk",
    maxDriveMinutes: "",
    people: "12",
    budget: "30000",
    cuisines: ["한식"],
    maxWalkMinutes: "",
    needRoom: true,
    needReservation: false,
    extra: "",
  };

  it("올바른 입력은 서버에 보낼 요청으로 바뀐다 (빈 도보 거리는 기본값)", () => {
    expect(validateFormValues(form)).toEqual({
      ok: true,
      request: {
        purpose: "dinner",
        people: 12,
        budget: 30000,
        cuisines: ["한식"],
        maxWalkMinutes: undefined,
        travelMode: "walk",
        needRoom: true,
        needReservation: false,
      },
    });
  });

  it("도보 거리를 적으면 숫자로 바뀐다", () => {
    const result = validateFormValues({ ...form, maxWalkMinutes: " 7 " });
    expect(result.ok && result.request.maxWalkMinutes).toBe(7);
  });

  it("빈 필수 칸은 '입력해 주세요'로 안내한다", () => {
    expect(validateFormValues({ ...form, people: "", budget: "  " })).toEqual({
      ok: false,
      fields: { people: "인원을 입력해 주세요", budget: "1인 예산을 입력해 주세요" },
    });
  });

  it("범위 밖·소수는 서버와 같은 문구로 안내한다", () => {
    expect(validateFormValues({ ...form, people: "0", budget: "1000", maxWalkMinutes: "7.5" })).toEqual({
      ok: false,
      fields: {
        people: "1~30명 사이로 입력해 주세요",
        budget: "5,000~200,000원 사이로 입력해 주세요",
        maxWalkMinutes: "도보 거리는 1~15분 사이로 입력해 주세요 (비우면 기본값)",
      },
    });
  });

  it("점심이면 룸 체크는 보내지 않고 예약 체크는 보낸다", () => {
    const result = validateFormValues({ ...form, purpose: "lunch", needRoom: true, needReservation: true });
    expect(result.ok && [result.request.needRoom, result.request.needReservation]).toEqual([false, true]);
  });
});

describe("이동 수단 (팀 회식 차량)", () => {
  const dinner = { purpose: "dinner", people: 8, budget: 30000 };

  it("회식에서 차량과 차량 거리를 받는다", () => {
    const result = parseRecommendRequest({ ...dinner, travelMode: "car", maxDriveMinutes: 20 });
    expect(result.ok && [result.request.travelMode, result.request.maxDriveMinutes]).toEqual(["car", 20]);
  });

  it("점심이면 차량을 보내도 도보로 바꾼다", () => {
    const result = parseRecommendRequest({ ...dinner, purpose: "lunch", travelMode: "car", maxDriveMinutes: 20 });
    expect(result.ok && [result.request.travelMode, result.request.maxDriveMinutes]).toEqual(["walk", undefined]);
  });

  it("정해지지 않은 이동 수단·범위 밖 차량 거리는 거부한다", () => {
    expect(fieldsOf({ ...dinner, travelMode: "bike" }).travelMode).toBeDefined();
    expect(fieldsOf({ ...dinner, travelMode: "car", maxDriveMinutes: 31 }).maxDriveMinutes).toBe(
      "차량 거리는 1~30분 사이로 입력해 주세요 (비우면 기본값)",
    );
  });
});
