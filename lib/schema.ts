// Design Ref: §3.1 — 식당 목록 파일의 형식 검사 규칙
// 가격·도보 시간은 반드시 숫자. 최대 인원·룸 여부·룸 인원·예약 여부는 확인하지 못했으면 "정보 없음"을 적을 수 있다.
// Design Ref: §3.2·§4 — 추천 요청(입력 조건) 검사 규칙
import { z } from "zod";
import {
  CUISINES,
  INPUT_LIMITS,
  MAX_WALK_MINUTES,
  RESERVATION_STATUSES,
  TRAVEL_MODES,
  UNKNOWN,
  type RecommendRequest,
  type TravelMode,
} from "./types";

/** 숫자(min 이상 정수) 또는 "정보 없음" */
function intOrUnknown(min: number, message: string) {
  const number = z
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message });
  return z.union([z.literal(UNKNOWN), number], { error: message });
}

/** 식당 한 곳의 검사 규칙 (lib/types.ts의 Restaurant와 같은 모양) */
export const restaurantSchema = z.strictObject(
  {
    id: z
      .string({ error: "고유 번호가 없거나 글자가 아닙니다" })
      .trim()
      .min(1, { error: "고유 번호가 비어 있습니다" }),
    name: z
      .string({ error: "가게 이름이 없거나 글자가 아닙니다" })
      .trim()
      .min(1, { error: "가게 이름이 비어 있습니다" }),
    cuisine: z.enum(CUISINES, {
      error: `메뉴 종류는 ${CUISINES.join("·")} 중 하나여야 합니다`,
    }),
    menus: z
      .array(
        z
          .string({ error: "메뉴 이름은 글자여야 합니다" })
          .trim()
          .min(1, { error: "메뉴 이름이 비어 있습니다" })
          .max(30, { error: "메뉴 이름은 30자 이내여야 합니다" }),
        { error: "대표 메뉴는 메뉴 이름의 목록 [ ]이어야 합니다" },
      )
      .min(1, { error: "대표 메뉴를 적으려면 1개 이상 필요합니다 (없으면 항목을 빼세요)" })
      .max(8, { error: "대표 메뉴는 8개까지 적을 수 있습니다" })
      .optional(),
    pricePerPerson: z
      .number({ error: "1인 가격은 숫자(원)여야 합니다" })
      .int({ error: "1인 가격은 정수(원)여야 합니다" })
      .positive({ error: "1인 가격은 0보다 커야 합니다" }),
    priceBasis: z
      .string({ error: "가격 기준은 글자여야 합니다" })
      .trim()
      .min(1, { error: "가격 기준이 비어 있습니다" })
      .max(40, { error: "가격 기준은 40자 이내여야 합니다" })
      .optional(),
    walkMinutes: z
      .number({ error: "도보 시간은 숫자(분)여야 합니다" })
      .int({ error: "도보 시간은 정수(분)여야 합니다" })
      .min(1, { error: "도보 시간은 1분 이상이어야 합니다" })
      .max(MAX_WALK_MINUTES, {
        error: `도보 시간은 ${MAX_WALK_MINUTES}분 이하여야 합니다 (그보다 먼 가게는 목록에 넣지 않음)`,
      }),
    driveMinutes: z
      .number({ error: "차량 시간은 숫자(분)여야 합니다" })
      .int({ error: "차량 시간은 정수(분)여야 합니다" })
      .min(1, { error: "차량 시간은 1분 이상이어야 합니다" })
      .max(60, { error: "차량 시간은 60분 이하여야 합니다" })
      .optional(),
    maxCapacity: intOrUnknown(1, `최대 인원은 1 이상의 정수(명) 또는 "${UNKNOWN}"이어야 합니다`),
    hasRoom: z.union([z.boolean(), z.literal(UNKNOWN)], {
      error: `룸 여부는 true, false 또는 "${UNKNOWN}"이어야 합니다`,
    }),
    roomCapacity: intOrUnknown(
      0,
      `룸 인원은 0 이상의 정수(명) 또는 "${UNKNOWN}"이어야 합니다 (룸이 없으면 0)`,
    ),
    groupSeating: z.boolean({ error: "단체석 표시 여부는 true 또는 false여야 합니다" }),
    reservation: z.enum(RESERVATION_STATUSES, {
      error: `예약 여부는 ${RESERVATION_STATUSES.join("·")} 중 하나여야 합니다`,
    }),
    source: z.string({ error: "출처는 글자(주소)여야 합니다" }).optional(),
  },
  { error: "정해지지 않은 항목이 들어 있습니다 (오타인지 확인)" },
)
  // 항목끼리 서로 맞는지 검사: 룸 여부와 룸 인원, 룸 인원과 최대 인원
  .superRefine((r, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (r.hasRoom === false && r.roomCapacity !== 0) issue("룸이 없으면 룸 인원은 0이어야 합니다");
    if (r.hasRoom === true && r.roomCapacity === 0) {
      issue(`룸이 있으면 룸 인원은 1명 이상 또는 "${UNKNOWN}"이어야 합니다`);
    }
    if (r.hasRoom === UNKNOWN && r.roomCapacity !== UNKNOWN) {
      issue(`룸 여부가 "${UNKNOWN}"이면 룸 인원도 "${UNKNOWN}"이어야 합니다`);
    }
    if (
      typeof r.roomCapacity === "number" &&
      typeof r.maxCapacity === "number" &&
      r.roomCapacity > r.maxCapacity
    ) {
      issue("룸 인원은 최대 인원보다 클 수 없습니다");
    }
  });

// ── 추천 요청(입력 조건) ─────────────────────────────────────────────

const { people, budget, maxWalkMinutes, maxDriveMinutes, extra } = INPUT_LIMITS;

/**
 * 추가 조건(자유 입력)에 들어오면 안 되는 개인정보 모양: 이메일(@), 7자리 이상 숫자, 전화번호 모양.
 * 이름은 걸러 낼 수 없어서 화면에 "개인정보를 적지 마세요" 안내를 함께 보여 준다.
 */
const PERSONAL_INFO_PATTERN = /@|\d{7,}|\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}/;

/** 정수 범위 검사. 숫자가 아니거나 범위 밖이면 같은 안내 문구를 쓴다. */
function intInRange(min: number, max: number, message: string) {
  return z
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message })
    .max(max, { error: message });
}

/** 추천 요청 검사 규칙. 정해지지 않은 항목(이름·연락처 등)은 받지 않는다. */
export const recommendRequestSchema = z
  .strictObject(
    {
      purpose: z.enum(["lunch", "dinner"], {
        error: "목적은 점심 약속 또는 팀 회식 중에서 골라 주세요",
      }),
      people: intInRange(
        people.min,
        people.max,
        `${people.min}~${people.max}명 사이로 입력해 주세요`,
      ),
      budget: intInRange(
        budget.min,
        budget.max,
        `${budget.min.toLocaleString("ko-KR")}~${budget.max.toLocaleString("ko-KR")}원 사이로 입력해 주세요`,
      ),
      cuisines: z
        .array(z.enum(CUISINES, { error: "메뉴 취향은 정해진 메뉴 중에서 골라 주세요" }), {
          error: "메뉴 취향은 정해진 메뉴 중에서 골라 주세요",
        })
        .max(CUISINES.length, { error: "메뉴 취향을 너무 많이 골랐습니다" })
        .default([])
        // 같은 메뉴를 두 번 보내도 한 번으로 친다
        .transform((list) => [...new Set(list)]),
      maxWalkMinutes: intInRange(
        maxWalkMinutes.min,
        maxWalkMinutes.max,
        `도보 거리는 ${maxWalkMinutes.min}~${maxWalkMinutes.max}분 사이로 입력해 주세요 (비우면 기본값)`,
      )
        .nullish()
        .transform((value) => value ?? undefined),
      travelMode: z
        .enum(TRAVEL_MODES, { error: "이동 수단은 도보 또는 차량 중에서 골라 주세요" })
        .default("walk"),
      maxDriveMinutes: intInRange(
        maxDriveMinutes.min,
        maxDriveMinutes.max,
        `차량 거리는 ${maxDriveMinutes.min}~${maxDriveMinutes.max}분 사이로 입력해 주세요 (비우면 기본값)`,
      )
        .nullish()
        .transform((value) => value ?? undefined),
      needRoom: z.boolean({ error: "룸 필요 여부가 올바르지 않습니다" }).default(false),
      needReservation: z.boolean({ error: "예약 필요 여부가 올바르지 않습니다" }).default(false),
      // 추가 조건(자연어): 줄바꿈·연속 공백을 정리하고, 길이와 개인정보 모양을 검사한다. 비면 없는 것으로 본다.
      extra: z
        .string({ error: "추가 조건은 글자로 입력해 주세요" })
        .nullish()
        .transform((value) => (value ?? "").replace(/\s+/g, " ").trim())
        .pipe(
          z
            .string()
            .max(extra.max, { error: `추가 조건은 ${extra.max}자 이내로 적어 주세요` })
            .refine((value) => !PERSONAL_INFO_PATTERN.test(value), {
              error: "연락처·이메일 같은 개인정보는 적지 마세요",
            }),
        )
        .transform((value) => value || undefined),
    },
    { error: "정해지지 않은 항목이 들어 있습니다" },
  )
  // 룸 조건과 차량 이동은 팀 회식에서만 쓴다. 점심이면 화면에 남은 값이 와도 무시한다. (예약 조건은 점심에도 쓴다)
  .transform((request) =>
    request.purpose === "lunch"
      ? { ...request, needRoom: false, travelMode: "walk" as const, maxDriveMinutes: undefined }
      : request,
  );

export type RequestValidationResult =
  | { ok: true; request: RecommendRequest }
  | { ok: false; fields: Record<string, string> };

/**
 * 추천 요청을 검사한다. 실패하면 칸 이름별 안내 문구를 돌려준다 (칸마다 첫 번째 문제만).
 * 특정 칸이 아닌 문제(요청 모양 자체가 틀림 등)는 "form" 칸에 담는다.
 */
export function parseRecommendRequest(body: unknown): RequestValidationResult {
  const parsed = recommendRequestSchema.safeParse(body);
  if (parsed.success) {
    return { ok: true, request: parsed.data };
  }

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    fields[field] ??= issue.message;
  }
  return { ok: false, fields };
}

// ── 화면 입력 검사 (PLAN 작업 17) ───────────────────────────────────

/** 화면 입력 칸의 값. 숫자 칸은 비워 둘 수 있도록 글자로 보관한다. */
export type FormValues = {
  purpose: RecommendRequest["purpose"];
  people: string;
  budget: string;
  cuisines: RecommendRequest["cuisines"];
  maxWalkMinutes: string;
  travelMode: TravelMode;
  maxDriveMinutes: string;
  needRoom: boolean;
  needReservation: boolean;
  /** 추가 조건(자연어). 비워 둘 수 있다 */
  extra: string;
};

/** 비어 있으면 안 되는 칸의 안내 */
const REQUIRED_MESSAGES = {
  people: "인원을 입력해 주세요",
  budget: "1인 예산을 입력해 주세요",
} as const;

/**
 * 화면 입력값을 서버에 보낼 요청으로 바꾸고, 서버와 같은 규칙으로 미리 검사한다.
 * 빈 필수 칸은 "입력해 주세요", 그 밖의 문제는 서버 검사와 같은 문구를 돌려준다.
 */
export function validateFormValues(values: FormValues): RequestValidationResult {
  const toNumber = (text: string) => (text.trim() === "" ? undefined : Number(text));
  const body = {
    purpose: values.purpose,
    people: toNumber(values.people),
    budget: toNumber(values.budget),
    cuisines: values.cuisines,
    maxWalkMinutes: toNumber(values.maxWalkMinutes),
    travelMode: values.travelMode,
    maxDriveMinutes: toNumber(values.maxDriveMinutes),
    needRoom: values.needRoom,
    needReservation: values.needReservation,
    extra: values.extra,
  };

  const result = parseRecommendRequest(body);
  if (result.ok) return result;

  const fields = { ...result.fields };
  for (const key of Object.keys(REQUIRED_MESSAGES) as (keyof typeof REQUIRED_MESSAGES)[]) {
    if (body[key] === undefined) fields[key] = REQUIRED_MESSAGES[key];
  }
  return { ok: false, fields };
}
