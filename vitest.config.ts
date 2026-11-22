import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // S0에 브라우저 테스트 없음 → node 환경
    // React 컴포넌트 테스트 추가 시 파일 상단 @vitest-environment jsdom 으로 오버라이드 (S1+)
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // S0에 단위 테스트 파일 없음 — S1+ 추가 시 제거
    passWithNoTests: true,
    coverage: {
      provider: "v8",
    },
  },
  resolve: {
    // tsconfig의 @/* 경로 별칭과 동기화
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
