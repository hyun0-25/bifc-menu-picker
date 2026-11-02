// 자동 점검(Vitest) 설정: 앱 코드와 같은 경로 별칭 "@/"를 쓸 수 있게 한다 (tsconfig.json의 paths와 동일)
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // "server-only"는 Next.js 서버에서만 통과하는 표시다. 점검은 서버 코드를 직접 돌리므로 빈 모듈로 바꾼다.
      "server-only": `${root}node_modules/next/dist/compiled/server-only/empty.js`,
    },
  },
});
