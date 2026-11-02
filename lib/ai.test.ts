// PLAN 작업 10 점검: AI에 보내는 지시문·요청 모양과 답 처리 (가짜 AI 연결 사용, 실제 호출 없음)
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  AiError,
  AiTimeoutError,
  buildUserMessage,
  requestAiPicks,
  SYSTEM_PROMPT,
  type ChatClient,
} from "./ai";
import type { RecommendRequest, Restaurant } from "./types";

const request: RecommendRequest = {
  purpose: "dinner",
  people: 10,
  budget: 30000,
  cuisines: ["한식"],
  needRoom: true,
  needReservation: false,
};

const candidates: Restaurant[] = [
  { id: "s1", name: "시험 국밥", cuisine: "한식", pricePerPerson: 11000, walkMinutes: 5, maxCapacity: 30, hasRoom: true, roomCapacity: 12, reservation: "불가" },
  { id: "s2", name: "시험 중식", cuisine: "중식", pricePerPerson: 25000, walkMinutes: 8, maxCapacity: 20, hasRoom: true, roomCapacity: 12, reservation: "가능" },
];

/** 정해 둔 답(content)을 돌려주는 가짜 AI 연결 */
function fakeClient(content: string | null) {
  const create = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  return { client: { chat: { completions: { create } } } as unknown as ChatClient, create };
}

function failingClient(error: unknown) {
  const create = vi.fn().mockRejectedValue(error);
  return { chat: { completions: { create } } } as unknown as ChatClient;
}

describe("지시문", () => {
  it("핵심 규칙(후보만, 3곳, 같은 메뉴 2곳, 50자, 숫자 표기, 지어내기 금지)이 들어 있다", () => {
    for (const rule of ["후보", "골라야 할 개수", "3곳", "최대 2곳", "50자", "1인 25,000원", "도보 5분", "2만 원대", "지어내지 않는다"]) {
      expect(SYSTEM_PROMPT).toContain(rule);
    }
  });

  it("사용자 메시지에 입력 조건과 후보 값이 그대로 들어간다 (거리는 기본값까지 풀어서)", () => {
    const message = buildUserMessage(request, candidates);
    expect(message).toContain('"목적": "팀 회식"');
    expect(message).toContain('"메뉴 취향": [\n    "한식"\n  ]');
    expect(message).toContain('"도보 거리(분 이내)": 15');
    expect(message).toContain('"id": "s2"');
    expect(message).toContain('"roomCapacity": 12');
    expect(message).toContain("후보 (2곳)");
    expect(message).toContain("골라야 할 개수: 2곳");
    expect(message).not.toContain("이전 답의 문제");
  });

  it("같은 메뉴 후보가 3곳 이상이면 그 메뉴를 짚어 주의를 준다", () => {
    expect(buildUserMessage(request, candidates)).not.toContain("주의:");
    const many = [...candidates, { ...candidates[0], id: "s3" }, { ...candidates[0], id: "s4" }];
    expect(buildUserMessage(request, many)).toContain("주의: 한식 후보가 2곳보다 많지만");
  });

  it("메뉴 취향이 비면 '상관없음'으로, 다시 요청할 때는 문제를 덧붙인다", () => {
    const message = buildUserMessage({ ...request, cuisines: [] }, candidates, "s1 이유가 50자를 넘음");
    expect(message).toContain('"메뉴 취향": "상관없음"');
    expect(message).toContain("이전 답의 문제");
    expect(message).toContain("s1 이유가 50자를 넘음");
  });
});

describe("requestAiPicks", () => {
  it("후보 id만 고를 수 있는 JSON 형식으로 요청하고, 답을 picks 배열로 돌려준다", async () => {
    const answer = { picks: [{ id: "s2", reason: "1인 25,000원, 도보 8분" }] };
    const { client, create } = fakeClient(JSON.stringify(answer));

    expect(await requestAiPicks(request, candidates, { client })).toEqual(answer.picks);

    const sent = create.mock.calls[0][0];
    expect(sent.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.response_format.json_schema.schema.properties.picks.items.properties.id.enum).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("답이 JSON이 아니면 AiError", async () => {
    const { client } = fakeClient("죄송합니다, 추천할 수 없습니다");
    await expect(requestAiPicks(request, candidates, { client })).rejects.toThrow(AiError);
  });

  it("답이 비어 있으면 AiError", async () => {
    const { client } = fakeClient(null);
    await expect(requestAiPicks(request, candidates, { client })).rejects.toThrow(AiError);
  });

  it("답 모양이 다르면 AiError", async () => {
    const { client } = fakeClient(JSON.stringify({ stores: ["s1"] }));
    await expect(requestAiPicks(request, candidates, { client })).rejects.toThrow("모양");
  });

  it("시간 초과는 AiTimeoutError", async () => {
    const client = failingClient(new OpenAI.APIConnectionTimeoutError());
    await expect(requestAiPicks(request, candidates, { client })).rejects.toThrow(AiTimeoutError);
  });

  it("그 밖의 호출 실패는 AiError (오류 원문은 넣지 않는다)", async () => {
    const client = failingClient(new Error("sk-비밀이 섞인 원문"));
    const error = await requestAiPicks(request, candidates, { client }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as Error).message).not.toContain("sk-");
  });
});
