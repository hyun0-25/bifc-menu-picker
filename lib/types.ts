// Design Ref: §3.1 — 식당 목록 파일(data/restaurants.json)의 한 줄 형식
// 이 파일은 형식만 정의한다. 파일 읽기·검사는 lib/restaurants.ts, lib/schema.ts에서 한다.

/** 메뉴 종류: 목록 파일에는 이 중 하나만 적는다. */
export const CUISINES = [
  "한식",
  "중식",
  "일식",
  "양식",
  "아시안",
  "고기",
  "분식",
  "기타",
] as const;

export type Cuisine = (typeof CUISINES)[number];

/** 예약 가능 여부: 확인하지 못했으면 "정보 없음"으로 적는다. */
export const RESERVATION_STATUSES = ["가능", "불가", "정보 없음"] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** 도보 시간 상한(분): BIFC 본사에서 15분 넘게 걸리는 가게는 목록에 넣지 않는다. */
export const MAX_WALK_MINUTES = 15;

/** 식당 한 곳 */
export type Restaurant = {
  /** 고유 번호, 예: "r01" (겹치지 않게) */
  id: string;
  /** 가게 이름 */
  name: string;
  /** 메뉴 종류 */
  cuisine: Cuisine;
  /** 1인 대표 가격(원) */
  pricePerPerson: number;
  /** BIFC 본사에서 걸어서 걸리는 시간(분), 1~15 */
  walkMinutes: number;
  /** 한 번에 받을 수 있는 최대 인원(명) */
  maxCapacity: number;
  /** 룸·단체석 여부 */
  hasRoom: boolean;
  /** 룸 하나에 앉을 수 있는 최대 인원(명). 룸이 없으면 0 */
  roomCapacity: number;
  /** 예약 가능 여부 */
  reservation: ReservationStatus;
};
