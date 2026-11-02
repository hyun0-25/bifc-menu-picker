// Design Ref: §6.4 — AI 연결 설정 (서버 전용)
// 이 파일은 서버에서만 실행된다. 화면(브라우저) 코드에서 가져오면 빌드가 실패하도록 막는다.
// AI 지시문·호출은 PLAN 작업 10에서 이 파일에 추가한다.
import "server-only";
import OpenAI from "openai";

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
