// Design Ref: §3.1 — 식당 목록 파일의 형식 검사 규칙 (모르는 값은 허용하지 않음, 예약 여부만 "정보 없음" 가능)
// 입력 조건·AI 답 검사 규칙은 이후 작업(PLAN 8, 11)에서 이 파일에 추가한다.
import { z } from "zod";
import { CUISINES, MAX_WALK_MINUTES, RESERVATION_STATUSES } from "./types";

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
