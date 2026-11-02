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

/** 확인하지 못한 값. 짐작해서 숫자를 적지 않고 이 값을 적는다 (Design §3.1). */
export const UNKNOWN = "정보 없음";
export type Unknown = typeof UNKNOWN;

/**
 * 최대 인원이 "정보 없음"일 때도 받아들일 수 있다고 보는 인원 상한.
 * 식당이면 이 정도는 앉을 수 있다고 보고, 이보다 많으면 단체석·룸 표시가 있어야 후보가 된다.
 */
export const SMALL_GROUP_LIMIT = 4;

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
  /** 한 번에 받을 수 있는 최대 인원(명). 모르면 "정보 없음" */
  maxCapacity: number | Unknown;
  /** 룸(프라이빗룸) 여부. 룸 표시가 없어 확인하지 못했으면 "정보 없음" */
  hasRoom: boolean | Unknown;
  /** 룸 하나에 앉을 수 있는 최대 인원(명). 룸이 없으면 0, 모르면 "정보 없음" */
  roomCapacity: number | Unknown;
  /** 단체석 표시 여부 (카카오맵 등에 "단체석"이 표시되어 있으면 true) */
  groupSeating: boolean;
  /** 예약 가능 여부 */
  reservation: ReservationStatus;
  /** 정보 출처 (예: 카카오맵 장소 주소). 화면에는 쓰지 않는다. */
  source?: string;
};

// Design Ref: §3.2 — 입력 조건 중 코드 필터에 쓰는 부분 (메뉴 취향은 "되도록" 기준이라 필터에 넣지 않음)

/** 목적: 점심 약속(lunch) / 팀 회식(dinner) */
export type Purpose = "lunch" | "dinner";

/** 도보 거리를 입력하지 않았을 때 쓰는 기본값(분) — PRD must ① 규칙 6 */
export const DEFAULT_WALK_MINUTES: Record<Purpose, number> = {
  lunch: 10,
  dinner: 15,
};

/** 필터 조건 */
export type FilterConditions = {
  purpose: Purpose;
  /** 인원(명) */
  people: number;
  /** 1인 예산(원) */
  budget: number;
  /** 도보 거리(분). 비우면 목적별 기본값 */
  maxWalkMinutes?: number;
  /** 룸(단체석) 필요 여부 */
  needRoom: boolean;
  /** 예약 필요 여부 */
  needReservation: boolean;
};

/** 입력 칸별 허용 범위 — Design §3.2 (서버 검사와 화면 입력 칸이 같은 값을 쓴다) */
export const INPUT_LIMITS = {
  people: { min: 1, max: 30 },
  budget: { min: 5_000, max: 200_000 },
  maxWalkMinutes: { min: 1, max: MAX_WALK_MINUTES },
} as const;

/** 추천 요청 (화면 → 서버): 필터 조건 + 메뉴 취향 */
export type RecommendRequest = FilterConditions & {
  /** 메뉴 취향. 비어 있으면 "상관없음" (필터가 아니라 AI가 우선해서 고르는 기준) */
  cuisines: Cuisine[];
};

/** AI 답 하나: 고른 가게 id와 이유 (나머지 값은 코드가 목록에서 채운다) */
export type AiPick = { id: string; reason: string };

// Design Ref: §3.3·§4 — 서버 → 화면 응답

/** 추천 결과 한 곳: 목록 값 그대로 + 추천 이유 */
export type Recommendation = Restaurant & {
  /** 추천 이유 1줄 (AI가 쓴 글 또는 코드가 만든 기본 문장) */
  reason: string;
};

/** 추천 결과 응답 (200) */
export type RecommendResponse = {
  /** 추천 가게. 후보가 3곳 이상이면 정확히 3곳 */
  recommendations: Recommendation[];
  /** 안내 문구 (후보 부족 등). 없으면 생략 */
  notice?: string;
};

/** 오류 코드 — Design §4 */
export type ErrorCode = "INVALID_INPUT" | "DATA_ERROR" | "AI_TIMEOUT" | "AI_ERROR";

/** 오류 응답 (400·500 등) */
export type ErrorResponse = {
  error: {
    code: ErrorCode;
    /** 화면에 보여 줄 문구 */
    message: string;
    /** 칸별 안내 (입력 오류일 때만) */
    fields?: Record<string, string>;
  };
};
