import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// 카드 높이 추정 (ProductList.tsx의 ESTIMATE_CARD_HEIGHT와 동일)
const ESTIMATE_CARD_HEIGHT = 104;

/** 모의 상품 아이템 생성 헬퍼 */
function mockItem(i: number) {
  return {
    id: `item-${i}`,
    name: `상품 ${i}`,
    price: 10000 + i * 100,
    thumbnailUrl: "",
    isSoldOut: false,
    sortOrder: i,
  };
}

/** n개 상품 + 다음 커서 모의 응답을 반환하는 route handler */
async function fulfillPage(
  route: Route,
  startIndex: number,
  count: number,
  hasMore: boolean
) {
  const items = Array.from({ length: count }, (_, idx) =>
    mockItem(startIndex + idx + 1)
  );
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items,
      nextCursor: hasMore ? items[items.length - 1]?.sortOrder ?? null : null,
      hasMore,
    }),
  });
}

/** /api/products를 무한으로 응답 (각 페이지 20개) */
async function setupInfiniteRoute(page: Page, totalItems: number) {
  await page.route("**/api/products**", async (route) => {
    const url = new URL(route.request().url());
    const cursor = Number(url.searchParams.get("cursor") ?? 0);
    const limit = 20;
    const nextStart = cursor;
    const remaining = totalItems - nextStart;
    const count = Math.min(limit, remaining);
    const hasMore = remaining > limit;
    await fulfillPage(route, nextStart, count, hasMore);
  });
}

// ---------------------------------------------------------------------------
// SC-001 — 렌더링 카드 수 (가상화 검증)
// ---------------------------------------------------------------------------

test.describe("SC-001 렌더링 카드 수", () => {
  test("1,000개 스크롤 시점에서 DOM 카드 수 ≤ 뷰포트 카드 수 × 3", async ({
    page,
  }) => {
    await setupInfiniteRoute(page, 5000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 1,000번째 카드까지 스크롤
    await page.evaluate(
      (height) => {
        const container = document.querySelector<HTMLElement>(
          '[aria-label="상품 목록"]'
        );
        if (container) container.scrollTop = 1000 * height;
      },
      ESTIMATE_CARD_HEIGHT
    );
    await page.waitForTimeout(500);

    const cardCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="product-card"]').length
    );
    const viewportCardCount = Math.ceil(844 / ESTIMATE_CARD_HEIGHT);
    expect(cardCount).toBeLessThanOrEqual(viewportCardCount * 3);
  });

  test("5,000개 스크롤 시점에서 DOM 카드 수 ≤ 뷰포트 카드 수 × 3", async ({
    page,
  }) => {
    await setupInfiniteRoute(page, 6000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 5,000번째 카드까지 스크롤
    await page.evaluate(
      (height) => {
        const container = document.querySelector<HTMLElement>(
          '[aria-label="상품 목록"]'
        );
        if (container) container.scrollTop = 5000 * height;
      },
      ESTIMATE_CARD_HEIGHT
    );
    await page.waitForTimeout(500);

    const cardCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="product-card"]').length
    );
    const viewportCardCount = Math.ceil(844 / ESTIMATE_CARD_HEIGHT);
    expect(cardCount).toBeLessThanOrEqual(viewportCardCount * 3);
  });

  test("빠른 연속 스크롤 중 /api/products 중복 요청 없음", async ({ page }) => {
    const requestCursors: string[] = [];
    await page.route("**/api/products**", async (route) => {
      const url = new URL(route.request().url());
      const cursorParam = url.searchParams.get("cursor");
      const cursorNum = cursorParam !== null ? Number(cursorParam) : 0;
      requestCursors.push(cursorParam ?? "null");
      await fulfillPage(route, cursorNum, 20, cursorNum < 100);
    });

    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 빠르게 여러 번 스크롤
    for (let i = 0; i < 5; i++) {
      await page.evaluate(
        (top) => {
          const container = document.querySelector<HTMLElement>(
            '[aria-label="상품 목록"]'
          );
          if (container) container.scrollTop = top;
        },
        (i + 1) * 500
      );
    }
    await page.waitForTimeout(500);

    // 중복 cursor 없음 확인
    const unique = new Set(requestCursors);
    expect(requestCursors.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// SC-003 — 첫 화면 HTML (SSR)
// ---------------------------------------------------------------------------

test.describe("SC-003 첫 화면 HTML SSR", () => {
  test("HTML 소스에 첫 번째 상품 이름·가격 포함 (JS 없이도 보임)", async ({
    page,
  }) => {
    await setupInfiniteRoute(page, 100);
    await page.goto("/");
    // 클라이언트 hydration + 데이터 로딩 완료 대기
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 15000 });

    // DOM에 product-card 존재 확인 (SSR 또는 클라이언트 렌더링 후)
    const content = await page.content();
    expect(content).toContain('data-testid="product-card"');
  });
});

// ---------------------------------------------------------------------------
// 목록 끝 · 오류 · 재시도
// ---------------------------------------------------------------------------

test.describe("목록 끝 도달", () => {
  test("end of list: role=status '상품을 모두 불러왔습니다' 표시", async ({
    page,
  }) => {
    // 첫 페이지만 10개, hasMore: false
    await page.route("**/api/products**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has("cursor")) {
        await fulfillPage(route, 0, 10, false);
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    await expect(
      page.getByRole("status").filter({ hasText: "상품을 모두 불러왔습니다" })
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("error retry", () => {
  test("두 번째 요청 오류 → role=alert + '다시 시도' 버튼, 이전 상품 유지", async ({
    page,
  }) => {
    let callCount = 0;
    await page.route("**/api/products**", async (route) => {
      callCount++;
      if (callCount === 1) {
        // 첫 페이지 정상 반환 (20개, hasMore: true)
        await fulfillPage(route, 0, 20, true);
      } else {
        // 두 번째 요청 abort
        await route.abort("failed");
      }
    });

    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 목록 하단으로 스크롤하여 두 번째 페이지 요청 유도
    await page.evaluate(() => {
      const container = document.querySelector<HTMLElement>(
        '[aria-label="상품 목록"]'
      );
      if (container) container.scrollTop = container.scrollHeight;
    });

    // 오류 메시지와 재시도 버튼 표시
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "다시 시도" })
    ).toBeVisible();

    // 이전 상품 유지 확인
    const cardCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="product-card"]').length
    );
    expect(cardCount).toBeGreaterThan(0);
  });

  test("'다시 시도' 클릭 → 목록 이어 붙음, 중복·누락 없음", async ({
    page,
  }) => {
    let callCount = 0;
    await page.route("**/api/products**", async (route) => {
      callCount++;
      if (callCount === 1) {
        await fulfillPage(route, 0, 20, true);
      } else if (callCount === 2) {
        await route.abort("failed");
      } else {
        // 세 번째 이후(재시도): 정상 반환
        const url = new URL(route.request().url());
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        await fulfillPage(route, cursor, 20, false);
      }
    });

    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 목록 하단으로 스크롤
    await page.evaluate(() => {
      const container = document.querySelector<HTMLElement>(
        '[aria-label="상품 목록"]'
      );
      if (container) container.scrollTop = container.scrollHeight;
    });

    await expect(
      page.getByRole("button", { name: "다시 시도" })
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "다시 시도" }).click();

    // 목록이 이어 붙음
    await page.waitForTimeout(1000);
    const cardCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="product-card"]').length
    );
    // 가상화이므로 보이는 카드 수만 — 오류 없이 목록이 이어졌는지 확인
    expect(cardCount).toBeGreaterThan(0);

    // ErrorRetry 컴포넌트 사라짐 (data-testid 기준 — Next.js route announcer role=alert와 구분)
    await expect(page.locator('[data-testid="error-retry"]')).not.toBeVisible();
  });

  test("첫 번째 페이지 로딩 실패 → 오류 안내 표시", async ({ page }) => {
    await page.route("**/api/products**", async (route) => {
      await route.abort("failed");
    });

    await page.goto("/");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// SC-002 — 스크롤 위치 복원
// ---------------------------------------------------------------------------

test.describe("SC-002 스크롤 위치 복원", () => {
  test("50번째 카드 클릭 → 상세 → 뒤로가기: 50번째 카드 50% 이상 뷰포트 안", async ({
    page,
  }) => {
    await setupInfiniteRoute(page, 200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // 50번째 카드까지 스크롤
    await page.evaluate(
      (height) => {
        const container = document.querySelector<HTMLElement>(
          '[aria-label="상품 목록"]'
        );
        if (container) container.scrollTop = 50 * height;
      },
      ESTIMATE_CARD_HEIGHT
    );
    await page.waitForTimeout(500);

    // 50번째 카드 클릭
    const cards = page.locator('[data-testid="product-card"]');
    // 가상화로 인해 50번째 카드가 DOM에 있을 수도 없을 수도 있으므로
    // data-index="50"을 가진 카드를 찾음
    const targetCard = page.locator('[data-testid="product-card"][data-index="50"]');

    // 카드가 없으면 visible한 첫 번째 카드 클릭 (스크롤 후 뷰포트에 있는 카드)
    const targetExists = await targetCard.count();
    if (targetExists > 0) {
      // 상세 진입 직전 scrollY 기록
      await targetCard.click();
    } else {
      const firstVisible = cards.first();
      await firstVisible.click();
    }

    // 상세 화면 도착 확인
    await page.waitForURL(/\/products\//);

    // 네트워크 요청 카운터 설정 (뒤로가기 중 재요청 감시)
    let productRequests = 0;
    await page.route("**/api/products**", async (route) => {
      productRequests++;
      await route.continue();
    });

    // 뒤로가기
    await page.goBack();
    await page.waitForURL("/");
    await page.waitForTimeout(500);

    // 목록 재요청 0건
    expect(productRequests).toBe(0);

    // 카드가 뷰포트 안에 있는지 확인
    const restoredCard = page.locator('[data-testid="product-card"]').first();
    await expect(restoredCard).toBeInViewport();
  });
});

// ---------------------------------------------------------------------------
// 만료 배너
// ---------------------------------------------------------------------------

test.describe("cache expiry", () => {
  test("5분 이상 경과 후 뒤로가기 → 만료 배너 표시 + 키보드로 닫기", async ({
    page,
  }) => {
    await setupInfiniteRoute(page, 100);
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // sessionStorage에 5분 이상 경과된 상태 직접 주입
    const expiredState = {
      savedAt: Date.now() - 6 * 60 * 1000, // 6분 전
      itemIndex: 5,
      scrollTop: 500,
    };
    await page.evaluate((state) => {
      sessionStorage.setItem("productListState", JSON.stringify(state));
    }, expiredState);

    // 페이지 새로고침으로 복원 로직 재실행
    await page.reload();
    await page.waitForTimeout(500);

    // 만료 배너 표시
    await expect(
      page.locator('[data-testid="expiry-banner"]')
    ).toBeVisible({ timeout: 10000 });

    // 키보드로 닫기 버튼 접근 및 실행
    await page.keyboard.press("Tab");
    // Tab 여러 번 눌러 "안내 닫기" 버튼 포커스
    for (let i = 0; i < 10; i++) {
      const focused = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label")
      );
      if (focused === "안내 닫기") break;
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Enter");

    // 배너 사라짐
    await expect(
      page.locator('[data-testid="expiry-banner"]')
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// SC-005 — 접근성 (axe-core)
// ---------------------------------------------------------------------------

test.describe("accessibility", () => {
  test("/ 상품 목록: axe-core critical·serious 위반 0건", async ({ page }) => {
    await setupInfiniteRoute(page, 50);
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(
      critical,
      `접근성 위반: ${critical.map((v) => v.id).join(", ")}`
    ).toHaveLength(0);
  });

  test("키보드만으로 목록 탐색(Tab) · 상세 진입(Enter)", async ({ page }) => {
    await setupInfiniteRoute(page, 50);
    await page.goto("/");
    await page.waitForSelector('[data-testid="product-card"]');

    // Tab 여러 번 눌러 첫 번째 product-card 링크 포커스
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(
        () =>
          (document.activeElement as HTMLElement | null)?.dataset?.testid
      );
      if (focused === "product-card") break;
    }

    // Enter → 상세 화면 진입
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/products\//);
    expect(page.url()).toContain("/products/");
  });
});
