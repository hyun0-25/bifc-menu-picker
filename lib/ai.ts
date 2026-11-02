// Design Ref: §6.4 — AI 연결 설정과 추천 지시문·호출 (서버 전용)
// 이 파일은 서버에서만 실행된다. 화면(브라우저) 코드에서 가져오면 빌드가 실패하도록 막는다.
import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { resolveMaxWalkMinutes } from "./filter";
import type { RecommendRequest, Restaurant } from "./types";
import { MAX_SAME_CUISINE, RECOMMEND_COUNT } from "./verify";

/** OPENAI_MODEL이 비어 있을 때 쓰는 기본 모델 (가볍고 저렴한 모델) */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/** AI 한 번 호출에 기다리는 최대 시간(밀리초) */
export const AI_TIMEOUT_MS = 20_000;

/** AI 설정이 빠졌을 때 던지는 오류 (키 값은 메시지에 넣지 않는다) */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

let client: OpenAI | undefined;

/** OpenAI 연결을 돌려준다. 키는 process.env에서만 읽고, 한 번 만든 연결을 다시 쓴다. */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiConfigError(
      "OPENAI_API_KEY가 설정되지 않았습니다 (.env 또는 Vercel 환경 변수를 확인하세요)",
    );
  }
  // 라이브러리 자체 재시도는 끄고(maxRetries: 0), 다시 요청할지는 앱이 정한다 (Design §2.2 처리 9)
  client ??= new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return client;
}

/** 사용할 모델 이름: .env의 OPENAI_MODEL, 없으면 기본 모델 */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

// ── 추천 지시문과 호출 (PLAN 작업 10) ───────────────────────────────

/** AI가 응답하지 않았을 때(시간 초과) */
export class AiTimeoutError extends Error {
  constructor() {
    super("AI 응답 시간 초과");
    this.name = "AiTimeoutError";
  }
}

/** AI 호출이 실패했거나 답 모양이 틀렸을 때 */
export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

/** AI가 돌려주는 답 하나: 고른 가게 id와 이유 (나머지 값은 코드가 목록에서 채운다) */
export type AiPick = { id: string; reason: string };

const aiAnswerSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

/**
 * 시스템 지시문. PRD must ① 규칙 1·2·7, must ② 규칙 1~4, Design §3.4 이유 규칙.
 * 조건 거르기(예산·인원·룸·예약·거리)는 코드가 이미 했으므로 여기서는 고르기와 이유 쓰기만 맡긴다.
 */
export const SYSTEM_PROMPT = `너는 부산 문현동 BIFC 본사 직원에게 점심·회식 장소를 골라 주는 도우미다.
사용자 메시지로 "입력 조건"과 "후보" 목록(JSON)이 주어진다. 후보는 이미 예산·인원·룸·예약·도보 거리 조건을 통과한 가게들이다.

[고르기 규칙]
1. 반드시 "후보"에 있는 가게만 고른다. 답에는 후보의 id를 그대로 쓴다. 후보에 없는 가게를 만들어 내지 않는다.
2. 사용자 메시지의 "골라야 할 개수"만큼 고른다 (후보가 ${RECOMMEND_COUNT}곳 이상이면 ${RECOMMEND_COUNT}곳, 적으면 후보 전부). 같은 가게를 두 번 고르지 않는다. 개수를 채우려고 같은 가게를 반복하지 않는다.
3. 고른 가게 중 같은 메뉴 종류(cuisine)는 최대 ${MAX_SAME_CUISINE}곳까지만 넣는다. 이 규칙은 메뉴 취향보다 항상 먼저다.
4. "메뉴 취향"이 있으면 그 메뉴를 우선해서 고르되, 3번 규칙 안에서만 우선한다.
   예: 메뉴 취향이 ["한식"] 하나뿐이고 한식 후보가 많아도 한식은 ${MAX_SAME_CUISINE}곳까지만, 나머지는 다른 메뉴 후보에서 고른다.
   메뉴 취향이 비어 있으면 메뉴를 고르게 섞는다.
5. 가장 추천하는 가게부터 순서대로 쓴다.

[추천 이유 규칙]
6. 가게마다 한 줄, 공백 포함 50자 이내로 쓴다.
7. 아래 숫자 항목 중 2개 이상을 넣는다. 표기는 반드시 이 모양을 따른다.
   - 1인 가격: "1인 25,000원" (쉼표 있는 아라비아 숫자 + 원)
   - 도보 시간: "도보 5분"
   - 인원: maxCapacity는 "최대 20명", roomCapacity는 "룸 12명", 입력 인원은 "10명"처럼 무엇의 인원인지 붙여 쓴다
8. 숫자는 후보에 적힌 값과 입력 인원만 그대로 쓴다. 값을 바꾸거나 어림하지 않는다. "2만 원대", "2만 5천 원" 같은 한글 숫자·어림 표현은 쓰지 않는다. 위 항목 외의 숫자는 쓰지 않는다.
9. 맛·분위기 평가, 영업시간, 주차, 메뉴 이름처럼 후보에 없는 정보는 지어내지 않는다.

[좋은 이유 예시]
- "1인 25,000원, 도보 8분, 룸 12명이라 회식에 적합"
- "도보 5분, 1인 11,000원으로 가볍게 점심"`;

/** 사용자 메시지: 입력 조건과 후보를 AI가 읽기 쉬운 JSON으로 만든다. feedback은 다시 요청할 때(작업 12) 쓴다. */
export function buildUserMessage(
  request: RecommendRequest,
  candidates: readonly Restaurant[],
  feedback?: string,
): string {
  const conditions = {
    목적: request.purpose === "lunch" ? "점심 약속" : "팀 회식",
    인원: request.people,
    "1인 예산(원)": request.budget,
    "메뉴 취향": request.cuisines.length > 0 ? request.cuisines : "상관없음",
    "도보 거리(분 이내)": resolveMaxWalkMinutes(request),
    "룸 필요": request.needRoom,
    "예약 필요": request.needReservation,
  };
  const list = candidates.map((r) => ({
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    pricePerPerson: r.pricePerPerson,
    walkMinutes: r.walkMinutes,
    maxCapacity: r.maxCapacity,
    hasRoom: r.hasRoom,
    roomCapacity: r.roomCapacity,
    reservation: r.reservation,
  }));

  // 메뉴별 후보 수. AI가 같은 메뉴를 3곳 고르는 실수를 자주 해서, 넘치는 메뉴를 이름으로 짚어 준다.
  const cuisineCounts = new Map<string, number>();
  for (const r of candidates) cuisineCounts.set(r.cuisine, (cuisineCounts.get(r.cuisine) ?? 0) + 1);
  const crowded = [...cuisineCounts].filter(([, n]) => n > MAX_SAME_CUISINE).map(([c]) => c);

  const parts = [
    `입력 조건:\n${JSON.stringify(conditions, null, 2)}`,
    `후보 (${list.length}곳):\n${JSON.stringify(list, null, 2)}`,
    `골라야 할 개수: ${Math.min(RECOMMEND_COUNT, list.length)}곳 (서로 다른 가게)`,
  ];
  if (crowded.length > 0) {
    parts.push(
      `주의: ${crowded.join(", ")} 후보가 ${MAX_SAME_CUISINE}곳보다 많지만, 같은 메뉴는 최대 ${MAX_SAME_CUISINE}곳까지다. ` +
        `${crowded.join(", ")}은(는) ${MAX_SAME_CUISINE}곳까지만 고르고 나머지는 다른 메뉴 후보에서 골라라.`,
    );
  }
  if (feedback) {
    parts.push(`이전 답의 문제 (이번에는 고쳐서 답하세요):\n${feedback}`);
  }
  return parts.join("\n\n");
}

/** 답 모양: picks 배열. id는 후보 id 중 하나만 고를 수 있게 막는다. */
function answerFormat(candidateIds: string[]) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "restaurant_picks",
      strict: true,
      schema: {
        type: "object",
        properties: {
          picks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", enum: candidateIds },
                reason: { type: "string" },
              },
              required: ["id", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["picks"],
        additionalProperties: false,
      },
    },
  };
}

/** AI 호출에 필요한 부분만 (점검에서 가짜 연결로 바꿔 끼울 수 있게) */
export type ChatClient = Pick<OpenAI, "chat">;

/**
 * 후보 중 추천할 가게와 이유를 AI에게 받아 온다. 답은 검사 전 상태다 (검사는 lib/verify.ts, 작업 11·12).
 * 후보가 없으면 부르지 않는다 (호출하는 쪽에서 먼저 막는다).
 */
export async function requestAiPicks(
  request: RecommendRequest,
  candidates: readonly Restaurant[],
  options: { feedback?: string; client?: ChatClient } = {},
): Promise<AiPick[]> {
  const client = options.client ?? getOpenAIClient();

  let content: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(request, candidates, options.feedback) },
      ],
      response_format: answerFormat(candidates.map((r) => r.id)),
    });
    content = completion.choices[0]?.message.content;
  } catch (error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError) throw new AiTimeoutError();
    // 오류 원문에는 요청 정보가 섞일 수 있어 상태 코드와 종류만 남긴다
    const status = error instanceof OpenAI.APIError ? ` (HTTP ${error.status})` : "";
    throw new AiError(`AI 호출 실패${status}: ${error instanceof Error ? error.name : "알 수 없음"}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(content ?? "");
  } catch {
    throw new AiError("AI 답이 JSON이 아닙니다");
  }
  const parsed = aiAnswerSchema.safeParse(json);
  if (!parsed.success) {
    throw new AiError("AI 답의 모양이 정해진 형식과 다릅니다");
  }
  return parsed.data.picks;
}
