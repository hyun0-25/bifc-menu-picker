// Design Ref: §2.2·§4 — 추천 서버 API: POST /api/recommend
// 흐름: 입력 검사 → 목록 읽기 → 필터 → (후보 0곳이면 바로 안내) → AI 고르기·검사·1회 재요청·보정 → 안내 문구
import { AiTimeoutError, requestAiPicks } from "@/lib/ai";
import { filterCandidates } from "@/lib/filter";
import { loadRestaurants, RestaurantDataError } from "@/lib/restaurants";
import { parseRecommendRequest } from "@/lib/schema";
import type { ErrorCode, ErrorResponse, RecommendResponse } from "@/lib/types";
import { chooseNotice, NOTICES, pickWithRetry } from "@/lib/verify";

/**
 * 이 API의 최대 실행 시간(초). 배포 플랫폼(Vercel)이 이 값을 보고 실행 제한을 정한다.
 * AI 1회 최대 20초 × (첫 요청 + 재요청 1회) + 여유. 화면은 45초까지 기다린다.
 */
export const maxDuration = 60;

/** 요청 본문 최대 크기(글자 수). 정상 요청은 수백 자 수준이다. */
const MAX_BODY_LENGTH = 10_000;

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
) {
  const body: ErrorResponse = { error: { code, message, ...(fields && { fields }) } };
  return Response.json(body, { status });
}

function invalidInput(fields: Record<string, string>) {
  return errorResponse(400, "INVALID_INPUT", "입력값을 다시 확인해 주세요.", fields);
}

export async function POST(request: Request) {
  // 1) 입력 검사 (Design §2.2 처리 4)
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) {
    return invalidInput({ form: "요청이 너무 큽니다" });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalidInput({ form: "요청 형식이 올바르지 않습니다" });
  }

  const parsed = parseRecommendRequest(body);
  if (!parsed.ok) {
    return invalidInput(parsed.fields);
  }
  const conditions = parsed.request;

  // 2) 목록 읽기 (처리 5) — 자세한 문제는 서버 기록에만 남기고 화면에는 짧게 알린다
  let restaurants;
  try {
    restaurants = await loadRestaurants();
  } catch (error) {
    if (error instanceof RestaurantDataError) {
      console.error(error.message);
    } else {
      console.error("식당 목록을 읽는 중 알 수 없는 오류", error);
    }
    return errorResponse(500, "DATA_ERROR", "식당 목록을 읽지 못했어요. 관리자에게 알려 주세요.");
  }

  // 3) 조건 거르기 (처리 6)
  const candidates = filterCandidates(restaurants, conditions);

  // 4) 후보가 0곳이면 AI를 부르지 않고 바로 안내한다 (처리 7, PRD must ① 규칙 2: 가게를 지어내지 않음)
  if (candidates.length === 0) {
    const empty: RecommendResponse = { recommendations: [], notice: NOTICES.none };
    return Response.json(empty);
  }

  // 5) AI 고르기 → 검사 → 문제 있으면 1회 재요청 → 남은 문제는 코드로 보정 (처리 8~10)
  let recommendations;
  try {
    const result = await pickWithRetry(
      (feedback) => requestAiPicks(conditions, candidates, { feedback }),
      candidates,
      conditions,
    );
    recommendations = result.recommendations;
    if (result.retried) {
      // 서버 기록용: 입력값·키는 남기지 않고 규칙 위반 내용만 남긴다
      console.warn(`AI 답을 다시 요청함. 보정 후 남은 문제 ${result.problems.length}건`, result.problems);
    }
  } catch (error) {
    console.error("AI 추천 실패", error instanceof Error ? error.message : error);
    if (error instanceof AiTimeoutError) {
      return errorResponse(504, "AI_TIMEOUT", "추천이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.");
    }
    return errorResponse(502, "AI_ERROR", "추천을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 6) 안내 문구 (처리 11)
  const notice = chooseNotice(candidates.length, recommendations.length);
  const response: RecommendResponse = { recommendations, ...(notice && { notice }) };
  return Response.json(response);
}
