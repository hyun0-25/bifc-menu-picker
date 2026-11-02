// Design Ref: §2.2·§4 — 추천 서버 API: POST /api/recommend
// 지금 단계(PLAN 작업 9): 입력 검사 → 목록 읽기 → 필터 → 가까운 순 3곳(기본 문장)까지. AI 연결은 작업 10~12에서 붙인다.
import { filterCandidates } from "@/lib/filter";
import { loadRestaurants, RestaurantDataError } from "@/lib/restaurants";
import { parseRecommendRequest } from "@/lib/schema";
import type { ErrorCode, ErrorResponse, RecommendResponse } from "@/lib/types";
import { chooseNotice, fillRecommendations } from "@/lib/verify";

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

  // 3) 조건 거르기 (처리 6) — 0곳이면 바로 안내 (처리 7)
  const candidates = filterCandidates(restaurants, conditions);

  // 4) 임시 선택: 가까운 순으로 메뉴 규칙을 지키며 3곳 (작업 10~12에서 AI 선택으로 바꾼다)
  const recommendations = fillRecommendations([], candidates, conditions);

  const notice = chooseNotice(candidates.length, recommendations.length);
  const response: RecommendResponse = { recommendations, ...(notice && { notice }) };
  return Response.json(response);
}
