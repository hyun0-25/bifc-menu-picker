// PLAN 작업 7: OpenAI 연결 확인 스크립트
// 실행: npm run check:ai  (.env의 OPENAI_API_KEY를 읽어 실제로 AI에 짧은 질문을 보낸다)
// 키 값은 절대 출력하지 않는다. 기본 모델은 lib/ai.ts의 DEFAULT_OPENAI_MODEL과 같게 유지한다.
import OpenAI from "openai";

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY가 없습니다. .env 파일을 확인하세요.");
  process.exit(1);
}

const client = new OpenAI({ timeout: 20_000, maxRetries: 0 });

try {
  console.log(`모델: ${model}`);

  // 1) 모델을 쓸 수 있는지
  await client.models.retrieve(model);
  console.log("✅ 모델 사용 가능");

  // 2) 정해진 JSON 모양으로 답을 받을 수 있는지 (추천 기능에서 쓰는 방식)
  const started = Date.now();
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: "연결 확인입니다. status에 OK를 넣어 답하세요." }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "connection_check",
        strict: true,
        schema: {
          type: "object",
          properties: { status: { type: "string" } },
          required: ["status"],
          additionalProperties: false,
        },
      },
    },
  });
  const answer = JSON.parse(completion.choices[0]?.message.content ?? "{}");
  console.log(`✅ JSON 답 받음: ${JSON.stringify(answer)} (${Date.now() - started}ms)`);
} catch (error) {
  // 오류 원문에는 요청 정보가 섞일 수 있어 상태 코드와 종류만 보여 준다
  const status = error?.status ? ` (HTTP ${error.status})` : "";
  console.error(`❌ 연결 실패${status}: ${error?.name ?? "알 수 없는 오류"}`);
  if (error?.status === 401) console.error("   키가 틀렸거나 폐기되었습니다. 새 키를 발급해 .env에 넣으세요.");
  if (error?.status === 404) console.error("   모델 이름을 확인하세요 (OPENAI_MODEL).");
  if (error?.status === 429) console.error("   사용 한도 초과 또는 요청이 너무 많습니다.");
  process.exit(1);
}
