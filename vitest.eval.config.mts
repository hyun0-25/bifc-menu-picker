// 성공 기준 평가(npm run eval) 설정: 실제 AI를 부르므로 평소 점검(npm test)과 분리한다.
// 경로 별칭은 vitest.config.mts와 같게 유지한다.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": `${root}node_modules/next/dist/compiled/server-only/empty.js`,
    },
  },
  test: {
    include: ["eval/**/*.eval.ts"],
    // 질문 10개 × AI 호출(재요청 포함)까지 기다린다
    testTimeout: 10 * 60_000,
  },
});
