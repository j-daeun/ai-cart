// 실패하는 테스트 (test/failing-test)
// 기대 결과 : 단위 테스트 단계 X

import { test, expect } from "vitest";

test("CI 차단 확인", () => {
  expect(1).toBe(2);
});