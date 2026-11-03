// 식당 목록 자동 갱신(scripts/refresh-lib.mjs) 점검: 네트워크 없이 값 뽑기와 합치기 규칙을 확인한다.
import { describe, expect, it } from "vitest";
import {
  BIFC_POINT,
  derivePlace,
  findNewPlaces,
  formatList,
  kakaoIdFromSource,
  mergePlace,
  representativePrice,
  walkMinutes,
} from "./refresh-lib.mjs";

/** 카카오맵 가게 상세 응답의 필요한 부분만 흉내 낸 시험용 값 */
function panel(overrides: Record<string, unknown> = {}) {
  return {
    summary: {
      name: "시험 식당",
      status: "Y",
      point: BIFC_POINT,
      meta: { updated_at: "2026-10-01 12:00:00" },
    },
    menu: {
      menus: {
        items: [
          { name: "짬뽕", price: 8000 },
          { name: "짜장면", price: 6000 },
          { name: "탕수육", price: 16000 },
        ],
      },
    },
    place_add_info: { full_detail_infos: [], simple_detail_infos: [] },
    my_store_notice: { is_available_booking: false },
    ...overrides,
  };
}

const NOW = new Date("2026-11-03T00:00:00+09:00");

const current = {
  id: "r01",
  name: "시험 식당",
  cuisine: "중식",
  menus: ["짬뽕", "짜장면", "탕수육"],
  pricePerPerson: 8000,
  walkMinutes: 1,
  driveMinutes: 2,
  maxCapacity: 24,
  hasRoom: "정보 없음",
  roomCapacity: "정보 없음",
  groupSeating: false,
  reservation: "정보 없음",
  source: "https://place.map.kakao.com/1",
};

describe("기본 계산", () => {
  it("source 주소에서 카카오맵 장소 번호를 뽑는다", () => {
    expect(kakaoIdFromSource("https://place.map.kakao.com/27485313")).toBe("27485313");
    expect(kakaoIdFromSource("https://example.com/1")).toBeUndefined();
    expect(kakaoIdFromSource(undefined)).toBeUndefined();
  });

  it("도보 시간: 기준점은 1분, 북쪽으로 약 335m(직선)는 올림해서 7분", () => {
    expect(walkMinutes(BIFC_POINT)).toBe(1);
    expect(walkMinutes({ lat: BIFC_POINT.lat + 0.003013, lon: BIFC_POINT.lon })).toBe(7);
  });

  it("대표 가격: 앞 8개 중간값을 500원 단위로 반올림, 가격이 없으면 undefined", () => {
    const prices = [14500, 18900, 10500, 13000, 12500, 14500, 15000, 14500, 99999].map((price) => ({ price }));
    expect(representativePrice(prices)).toBe(14500); // 9번째 값은 쓰지 않는다
    expect(representativePrice([{ price: 9300 }])).toBe(9500);
    expect(representativePrice([{ price: -1 }, { price: -1 }])).toBeUndefined();
    expect(representativePrice([])).toBeUndefined();
  });
});

describe("derivePlace (카카오맵 응답에서 값 뽑기)", () => {
  it("이름·메뉴·가격·도보·영업 상태를 뽑는다", () => {
    const d = derivePlace(panel(), NOW);
    expect(d).toMatchObject({
      name: "시험 식당",
      open: true,
      menus: ["짬뽕", "짜장면", "탕수육"],
      price: 8000,
      walk: 1,
      groupSeating: false,
      roomLabel: false,
      booking: false,
      infoAgeDays: 32,
    });
  });

  it("단체석·프라이빗룸 표시와 카카오 예약을 읽는다", () => {
    const d = derivePlace(
      panel({
        place_add_info: {
          full_detail_infos: [{ title: "좌석 옵션", items: [{ icon: { text: "프라이빗룸" } }, { icon: { text: "단체석" } }] }],
          simple_detail_infos: [],
        },
        my_store_notice: { is_available_booking: true },
      }),
      NOW,
    );
    expect(d).toMatchObject({ groupSeating: true, roomLabel: true, booking: true });
  });

  it("영업 상태가 Y가 아니면 open=false, 메뉴 가격이 없으면 price 없음, 긴 메뉴 이름은 뺀다", () => {
    const d = derivePlace(
      panel({
        summary: { name: "x", status: "N", point: BIFC_POINT },
        menu: { menus: { items: [{ name: "평일 점심", price: -1 }, { name: "가".repeat(25), price: -1 }] } },
      }),
      NOW,
    );
    expect(d.open).toBe(false);
    expect(d.price).toBeUndefined();
    expect(d.menus).toEqual(["평일 점심"]);
    expect(d.infoAgeDays).toBeUndefined();
  });
});

describe("mergePlace (안전하게 합치기)", () => {
  it("바뀐 값만 changes에 담고, 그대로면 비어 있다", () => {
    expect(mergePlace(current, derivePlace(panel(), NOW))).toMatchObject({ changes: [], warnings: [] });
  });

  it("이름·메뉴·가격·도보는 새 값으로 바꾼다 (가격이 20% 이상 달라지면 알림 문구)", () => {
    const d = { ...derivePlace(panel(), NOW), name: "새 이름", price: 12000, walk: 4 };
    const { next, changes } = mergePlace(current, d);
    expect(next).toMatchObject({ name: "새 이름", pricePerPerson: 12000, walkMinutes: 4, menus: ["짬뽕", "짜장면", "탕수육"] });
    expect(changes.find((c: { field: string }) => c.field === "pricePerPerson")).toMatchObject({
      from: 8000,
      to: 12000,
      note: "가격이 20% 이상 달라졌어요. 확인해 주세요",
    });
  });

  it("최대 인원·룸 인원은 어떤 경우에도 건드리지 않는다", () => {
    const { next } = mergePlace({ ...current, maxCapacity: 24, roomCapacity: 10 }, derivePlace(panel(), NOW));
    expect(next).toMatchObject({ maxCapacity: 24, roomCapacity: 10 });
  });

  it("단체석·프라이빗룸·카카오 예약이 새로 생기면 켜고, 룸 인원은 '정보 없음'으로 둔다", () => {
    const d = { ...derivePlace(panel(), NOW), groupSeating: true, roomLabel: true, booking: true };
    const { next } = mergePlace(current, d);
    expect(next).toMatchObject({ groupSeating: true, hasRoom: true, roomCapacity: "정보 없음", reservation: "가능" });
  });

  it("직접 확인했을 수 있는 값은 사라져도 지우지 않고 알리기만 한다", () => {
    const confirmed = { ...current, groupSeating: true, hasRoom: true, reservation: "가능" };
    const { next, warnings } = mergePlace(confirmed, derivePlace(panel(), NOW));
    expect(next).toMatchObject({ groupSeating: true, hasRoom: true, reservation: "가능" });
    expect(warnings.join("\n")).toContain("단체석");
    expect(warnings.join("\n")).toContain("프라이빗룸");
    expect(warnings.join("\n")).toContain("카카오 예약");
  });

  it("예약 '불가'로 확인한 값은 카카오 예약이 보여도 바꾸지 않는다", () => {
    const d = { ...derivePlace(panel(), NOW), booking: true };
    expect(mergePlace({ ...current, reservation: "불가" }, d).next.reservation).toBe("불가");
  });

  it("폐업 의심·너무 먼 가게는 값을 바꾸지 않고 알린다", () => {
    const d = { ...derivePlace(panel(), NOW), open: false, walk: 70, drive: 31 };
    const { next, warnings } = mergePlace(current, d);
    expect(next.walkMinutes).toBe(1);
    expect(warnings.join("\n")).toContain("영업 상태가 정상이 아니에요");
    expect(warnings.join("\n")).toContain("너무 멀어요");
  });

  it("1년 넘게 갱신 안 된 정보와 가격 미공개를 알린다", () => {
    const d = { ...derivePlace(panel(), NOW), infoAgeDays: 500, price: undefined };
    const { next, warnings } = mergePlace(current, d);
    expect(next.pricePerPerson).toBe(8000);
    expect(warnings.join("\n")).toContain("16개월 넘게");
    expect(warnings.join("\n")).toContain("가격이 공개되어 있지 않아");
  });

  it("가격 기준(priceBasis)이 있는 가게는 가격·메뉴를 건드리지 않는다", () => {
    const buffet = { ...current, priceBasis: "평일 점심 성인 가격", pricePerPerson: 39000 };
    const { next, warnings } = mergePlace(buffet, { ...derivePlace(panel(), NOW), price: 8000 });
    expect(next).toMatchObject({ pricePerPerson: 39000, menus: current.menus });
    expect(warnings[0]).toContain("평일 점심 성인 가격");
  });
});

describe("formatList·findNewPlaces", () => {
  it("가게 한 곳을 한 줄로, 항목 순서를 그대로 쓴다", () => {
    const text = formatList([{ id: "r01", name: "가", menus: ["a", "b"] }]);
    expect(text).toBe('[\n  { "id": "r01", "name": "가", "menus": ["a","b"] }\n]\n');
    expect(JSON.parse(text)).toEqual([{ id: "r01", name: "가", menus: ["a", "b"] }]);
  });

  it("목록에 없는 새 가게만 가까운 순으로 돌려준다", () => {
    const docs = [
      { id: "1", place_name: "이미 있음", category_name: "음식점", distance: "100", place_url: "u1" },
      { id: "3", place_name: "먼 가게", category_name: "음식점 > 한식", distance: "900", place_url: "u3" },
      { id: "2", place_name: "가까운 새 가게", category_name: "음식점 > 중식", distance: "300", place_url: "u2" },
    ];
    expect(findNewPlaces(docs, new Set(["1"])).map((p: { name: string }) => p.name)).toEqual(["가까운 새 가게", "먼 가게"]);
    expect(findNewPlaces(undefined, new Set())).toEqual([]);
  });
});

describe("차량 시간 어림", () => {
  it("가까울수록 짧고 최소 2분이다", async () => {
    const { driveMinutes, BIFC_POINT } = await import("./refresh-lib.mjs");
    expect(driveMinutes(BIFC_POINT)).toBe(2);
    expect(driveMinutes({ lat: BIFC_POINT.lat + 0.01, lon: BIFC_POINT.lon })).toBeGreaterThan(driveMinutes(BIFC_POINT));
  });
});
