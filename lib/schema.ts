// Design Ref: §3.1 — 식당 목록 파일의 형식 검사 규칙 (모르는 값은 허용하지 않음, 예약 여부만 "정보 없음" 가능)
// Design Ref: §3.2·§4 — 추천 요청(입력 조건) 검사 규칙
// AI 답 검사 규칙은 이후 작업(PLAN 11)에서 이 파일에 추가한다.
import { z } from "zod";
import {
  CUISINES,
  INPUT_LIMITS,
  MAX_WALK_MINUTES,
  RESERVATION_STATUSES,
  type RecommendRequest,
} from "./types";

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
    pricePerPerson: z
      .number({ error: "1인 가격은 숫자(원)여야 합니다" })
      .int({ error: "1인 가격은 정수(원)여야 합니다" })
      .positive({ error: "1인 가격은 0보다 커야 합니다" }),
    walkMinutes: z
      .number({ error: "도보 시간은 숫자(분)여야 합니다" })
      .int({ error: "도보 시간은 정수(분)여야 합니다" })
      .min(1, { error: "도보 시간은 1분 이상이어야 합니다" })
      .max(MAX_WALK_MINUTES, {
        error: `도보 시간은 ${MAX_WALK_MINUTES}분 이하여야 합니다 (그보다 먼 가게는 목록에 넣지 않음)`,
      }),
    maxCapacity: z
      .number({ error: "최대 인원은 숫자(명)여야 합니다" })
      .int({ error: "최대 인원은 정수(명)여야 합니다" })
      .positive({ error: "최대 인원은 1명 이상이어야 합니다" }),
    hasRoom: z.boolean({ error: "룸 여부는 true 또는 false여야 합니다" }),
    roomCapacity: z
      .number({ error: "룸 인원은 숫자(명)여야 합니다 (룸이 없으면 0)" })
      .int({ error: "룸 인원은 정수(명)여야 합니다" })
      .min(0, { error: "룸 인원은 0 이상이어야 합니다" }),
    reservation: z.enum(RESERVATION_STATUSES, {
      error: `예약 여부는 ${RESERVATION_STATUSES.join("·")} 중 하나여야 합니다`,
    }),
  },
  { error: "정해지지 않은 항목이 들어 있습니다 (오타인지 확인)" },
)
  // 항목끼리 서로 맞는지 검사: 룸 여부와 룸 인원, 룸 인원과 최대 인원
  .superRefine((r, ctx) => {
    if (!r.hasRoom && r.roomCapacity !== 0) {
      ctx.addIssue({ code: "custom", message: "룸이 없으면 룸 인원은 0이어야 합니다" });
    }
    if (r.hasRoom && r.roomCapacity < 1) {
      ctx.addIssue({ code: "custom", message: "룸이 있으면 룸 인원은 1명 이상이어야 합니다" });
    }
    if (r.roomCapacity > r.maxCapacity) {
      ctx.addIssue({ code: "custom", message: "룸 인원은 최대 인원보다 클 수 없습니다" });
    }
  });

// ── 추천 요청(입력 조건) ─────────────────────────────────────────────

const { people, budget, maxWalkMinutes } = INPUT_LIMITS;

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
      needRoom: z.boolean({ error: "룸 필요 여부가 올바르지 않습니다" }).default(false),
      needReservation: z.boolean({ error: "예약 필요 여부가 올바르지 않습니다" }).default(false),
    },
    { error: "정해지지 않은 항목이 들어 있습니다" },
  )
  // PRD 4장: 룸·예약 조건은 팀 회식에서만 묻는다. 점심이면 화면에 남은 체크 값이 와도 무시한다.
  .transform((request) =>
    request.purpose === "lunch" ? { ...request, needRoom: false, needReservation: false } : request,
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
