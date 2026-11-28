import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * .env.test.local 로드 (로컬 Supabase Docker URL 등)
 * dotenv 패키지 의존성 없이 직접 파싱 — S3+ 테스트가 Supabase를 직접 사용할 때 활용됨
 */
const envTestLocal = path.resolve(process.cwd(), ".env.test.local");
if (fs.existsSync(envTestLocal)) {
  const lines = fs.readFileSync(envTestLocal, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      // ??= : 이미 환경에 있으면 덮어쓰지 않음 (CI 주입값 우선)
      process.env[match[1]] ??= match[2];
    }
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 로컬 Supabase 단일 인스턴스 — 순차 실행
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI: 이미 build 완료 → start 사용.
    // 로컬: dotenv-cli로 .env.test.local을 주입해 로컬 Supabase로 연결.
    //   .env.local(원격 Supabase)이 환경에 있어도 덮어씀.
    // reuseExistingServer: 이미 떠 있는 서버 재사용 — 단, 직접 시작 시
    //   반드시 같은 커맨드(dotenv -e .env.test.local -- npm run dev)로 시작해야
    //   원격 Supabase에 붙지 않음.
    command: process.env.CI
      ? "npm run start"
      : "dotenv -e .env.test.local -- npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // Windows dev 서버 초기 컴파일 여유 (120s → 300s)
  },
  // globalSetup: "./tests/e2e/global-setup.ts",
  // ↑ S3+ 가변 테이블(cart 등) 추가 시 주석 해제 — FR-009 2단계 초기화 (결정 메모 U3)
});
