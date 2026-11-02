// 자동 점검(Vitest) 설정: 앱 코드와 같은 경로 별칭 "@/"를 쓸 수 있게 한다 (tsconfig.json의 paths와 동일)
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
