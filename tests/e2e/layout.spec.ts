import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("공통 레이아웃", () => {
  // ---- 360px 가로 스크롤 (SC-007) -------------------------------------------

  test("360px viewport: 가로 스크롤 없음", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  // ---- Skip Nav (FR-024) ----------------------------------------------------

  test("Tab 첫 포커스 → skip link 가시화, Enter → #main-content 포커스", async ({
    page,
  }) => {
    await page.goto("/");

    // 초기 상태에서 skip link는 화면 밖에 위치
    const skipLink = page.getByText("본문으로 건너뛰기");
    await expect(skipLink).not.toBeInViewport();

    // Tab 한 번 → skip link가 화면에 나타남
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toBeInViewport();

    // Enter → #main-content에 포커스 이동
    await page.keyboard.press("Enter");
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeFocused();
  });

  // ---- Header 링크 / 버튼 ---------------------------------------------------

  test('"AI Cart 홈" 링크: href="/"', async ({ page }) => {
    await page.goto("/");
    const homeLink = page.getByRole("link", { name: "AI Cart 홈" });
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test('장바구니 버튼: aria-disabled="true", accessible name "장바구니"', async ({
    page,
  }) => {
    await page.goto("/");
    // getByRole('button')은 aria-disabled 여부와 무관하게 모든 버튼을 찾음
    const cartBtn = page.getByRole("button", { name: "장바구니" });
    await expect(cartBtn).toHaveAttribute("aria-disabled", "true");
  });

  // ---- 404 (FR-025) ---------------------------------------------------------

  test("/nonexistent → 404 화면 + 홈 링크", async ({ page }) => {
    await page.goto("/nonexistent");

    // 404 heading 존재
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 홈으로 돌아가는 링크 href="/"
    const homeLink = page.getByRole("link", { name: /홈/ });
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  // ---- axe 접근성 스캔 (C2, SC-007) -----------------------------------------

  test("/ axe 접근성: critical·serious 위반 0건", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    // 위반이 있으면 어떤 규칙인지 메시지로 표시
    expect(critical, `접근성 위반: ${critical.map((v) => v.id).join(", ")}`).toHaveLength(0);
  });

  test("/nonexistent axe 접근성: critical·serious 위반 0건", async ({
    page,
  }) => {
    await page.goto("/nonexistent");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical, `접근성 위반: ${critical.map((v) => v.id).join(", ")}`).toHaveLength(0);
  });
});
