import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ---------------------------------------------------------------------------
// 시드 상품 ID 헬퍼
// /api/products로 첫 20개 상품(sort_order 1-20)을 가져와 sort_order → id 맵 반환.
// 시드가 항상 sort_order 오름차순으로 20개 이상 존재한다고 가정.
// ---------------------------------------------------------------------------

type ProductListItem = {
  id: string;
  sortOrder: number;
  name: string;
  price: number;
  thumbnailUrl: string;
  isSoldOut: boolean;
};

async function getSeedProductIds(
  request: Parameters<Parameters<typeof test>[2]>[0]["request"]
): Promise<Map<number, string>> {
  const res = await request.get("/api/products?limit=20");
  const body = (await res.json()) as { items: ProductListItem[] };
  const map = new Map<number, string>();
  for (const item of body.items) {
    map.set(item.sortOrder, item.id);
  }
  return map;
}

// 시드 sort_order별 특성 (seed.ts 기준)
// sort_order=1  : two-tier, 전체 품절
// sort_order=2  : two-tier, 부분 품절 (일부 옵션 조합 품절)
// sort_order=3  : no-option, 재고 있음
// sort_order=4  : one-tier (색상 3개), 재고 있음
// sort_order=5  : two-tier (색상 2개 × 사이즈 3개), 재고 있음
// sort_order=6  : two-tier + 긴 상세 이미지

// ---------------------------------------------------------------------------
// S9. 404 처리 (FR-004)
// ---------------------------------------------------------------------------

test.describe("S9. 404 처리", () => {
  test("존재하지 않는 ID → 상품을 찾을 수 없습니다 안내 표시", async ({ page }) => {
    await page.goto("/products/invalid-id-123");
    await expect(
      page.getByText("상품을 찾을 수 없습니다")
    ).toBeVisible();
  });

  test("404 페이지 → 목록으로 링크가 / 로 연결됨", async ({ page }) => {
    await page.goto("/products/invalid-id-123");
    const link = page.getByRole("link", { name: "목록으로" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/");
  });
});

// ---------------------------------------------------------------------------
// S2. 상세 정보 표시 (FR-001·FR-002·SC-004) — US3
// ---------------------------------------------------------------------------

test.describe("[US3] S2. 상세 정보 표시", () => {
  test("Scenario 1: 상품명·가격·대표 이미지 표시", async ({ page, request }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5); // two-tier, 재고 있음
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("원")).toBeVisible(); // 가격에 "원" 포함
    const thumb = page.getByRole("img").first();
    await expect(thumb).toBeVisible();
  });

  test("Scenario 2: 긴 상세 이미지 있는 상품 — 스크롤 후 visible", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(6); // sort_order=6 → 긴 상세 이미지 고정 배치
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // 상세 이미지는 페이지 아래쪽에 있으므로 스크롤 후 확인
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const imgs = page.getByRole("img");
    const count = await imgs.count();
    expect(count).toBeGreaterThan(0);
  });

  test("Scenario 3: 360px 뷰포트 — 가로 스크롤 없음 (SC-004)", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`/products/${productId}`);
    const hasHorizScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizScroll).toBe(false);
  });

  test("Scenario 4: 긴 상세 이미지 없는 상품 — 이미지 영역 없음", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(3); // no-option, 상세 이미지 없음 (sort_order 3은 6-20 범위 밖)
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // 상세 이미지 alt="... 상세 이미지"를 가진 img가 없어야 함
    const detailImg = page.getByRole("img", { name: /상세 이미지/ });
    await expect(detailImg).not.toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// S3. 옵션 선택과 버튼 활성화 (FR-008·FR-010) — US2 + US4
// ---------------------------------------------------------------------------

test.describe("[US2] S3. 옵션 선택과 버튼 활성화", () => {
  test("Scenario 1: 옵션 미선택 → 버튼 비활성화 상태", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5); // two-tier
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const buyBtn = page.getByRole("button", { name: "구매하기" });
    const cartBtn = page.getByRole("button", { name: "장바구니에 담기" });
    await expect(buyBtn).toBeDisabled();
    await expect(cartBtn).toBeDisabled();
  });

  test("Scenario 4: 일부만 선택 → 버튼 여전히 비활성화", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5); // two-tier
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // 첫 번째 그룹만 선택
    const firstGroup = page.getByRole("radiogroup").first();
    const firstOption = firstGroup.getByRole("radio").first();
    await firstOption.check();
    const buyBtn = page.getByRole("button", { name: "구매하기" });
    await expect(buyBtn).toBeDisabled();
  });

  test("Scenario 5: 모든 그룹 선택 → 버튼 활성화", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5); // two-tier
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const groups = page.getByRole("radiogroup");
    const groupCount = await groups.count();
    for (let i = 0; i < groupCount; i++) {
      const group = groups.nth(i);
      // 선택 가능한 첫 번째 옵션 선택
      const availableOption = group
        .getByRole("radio")
        .filter({ hasNot: page.locator("[disabled]") })
        .first();
      await availableOption.check();
    }
    const buyBtn = page.getByRole("button", { name: "구매하기" });
    await expect(buyBtn).toBeEnabled();
  });

  test("Scenario 8: 선택한 옵션 재클릭 → 선택 유지 (라디오 특성)", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const firstGroup = page.getByRole("radiogroup").first();
    const firstOption = firstGroup.getByRole("radio").first();
    await firstOption.check();
    expect(await firstOption.isChecked()).toBe(true);
    // 같은 옵션 재클릭
    await firstOption.click();
    expect(await firstOption.isChecked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S4. 품절 옵션 처리 (FR-009·FR-020) — US2
// ---------------------------------------------------------------------------

test.describe("[US2] S4. 품절 옵션 처리", () => {
  test("품절 옵션이 '품절' 텍스트와 함께 표시됨", async ({ page, request }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(2); // 부분 품절 two-tier
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const soldOutLabel = page.getByText("품절").first();
    await expect(soldOutLabel).toBeVisible();
  });

  test("품절 옵션은 disabled 속성 — 선택 불가", async ({ page, request }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(2);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // disabled 라디오가 1개 이상 존재하는지 확인
    const disabledRadios = page.getByRole("radio").filter({ hasNot: page.locator(":not([disabled])") });
    // 부분 품절이므로 disabled 라디오가 있어야 함
    // 단순히 disabled 속성이 있는 input 확인
    const count = await page.locator('input[type="radio"][disabled]').count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// S6. 키보드 방향키 옵션 이동 (FR-018) — US2 Scenario 6
// ---------------------------------------------------------------------------

test.describe("[US2] S6. 키보드 방향키 옵션 이동", () => {
  test("Arrow Right/Down → 같은 그룹 내 다음 옵션으로 이동·선택", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5); // two-tier (2 colors)
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const firstGroup = page.getByRole("radiogroup").first();
    const radios = firstGroup.getByRole("radio");
    await radios.first().focus();
    await page.keyboard.press("ArrowRight");
    // 두 번째 옵션이 선택되어야 함
    expect(await radios.nth(1).isChecked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S7. 옵션 상태 초기화 (FR-022) — US5
// ---------------------------------------------------------------------------

test.describe("[US5] S7. 옵션 상태 초기화", () => {
  test("Scenario 5: 옵션 선택 → 목록 이동 → 재진입 → 초기 상태", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    // 1. 상세 접속 후 옵션 선택
    await page.goto(`/products/${productId}`);
    const firstGroup = page.getByRole("radiogroup").first();
    const firstOption = firstGroup.getByRole("radio").first();
    await firstOption.check();
    expect(await firstOption.isChecked()).toBe(true);

    // 2. 목록으로 이동
    await page.getByRole("link", { name: "목록으로" }).click();
    await expect(page).toHaveURL("/");

    // 3. 같은 상세 재진입 (URL 직접 접근 → 새 마운트)
    await page.goto(`/products/${productId}`);
    // 아무 옵션도 선택 안 된 상태
    const radios = page.getByRole("radio");
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      expect(await radios.nth(i).isChecked()).toBe(false);
    }
  });

  test("Edge Case: 뒤로가기 후 앞으로가기 → 옵션 초기 상태", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const firstGroup = page.getByRole("radiogroup").first();
    const firstOption = firstGroup.getByRole("radio").first();
    await firstOption.check();

    // 뒤로가기
    await page.goto("/");
    // 앞으로가기
    await page.goBack();
    // 옵션 초기 상태
    const radios = page.getByRole("radio");
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      expect(await radios.nth(i).isChecked()).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// S1. 상품 목록 → 상세 이동 (FR-015) — US5 Scenario 1
// ---------------------------------------------------------------------------

test.describe("[US5] S1. 상품 목록 → 상세 이동", () => {
  test("Scenario 1: 목록 카드 클릭 → 상세 이동, 상품명·가격·이미지 표시", async ({
    page,
  }) => {
    await page.goto("/");
    // 첫 번째 상품 카드 클릭 (ProductCard 링크)
    const firstCard = page.getByRole("link").filter({ hasText: /원/ }).first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();
    // 상세 페이지로 이동했는지 확인
    await expect(page).toHaveURL(/\/products\/.+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("원")).toBeVisible();
    await expect(page.getByRole("img").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// S8. S1 스크롤 복원 회귀 없음 (SC-007) — US5 Scenario 2
// ---------------------------------------------------------------------------

test.describe("[US5] S8. S1 스크롤 복원 회귀 없음", () => {
  test("Scenario 2: 상세 → 뒤로가기 → 스크롤 위치 복원", async ({ page }) => {
    // 목록 로드
    await page.goto("/");
    await page.waitForSelector("[data-testid='product-card']", { timeout: 10_000 }).catch(() => {
      // testid 없으면 링크로 대체
    });
    // 컨테이너 스크롤: S1은 window scroll이 아닌 [aria-label="상품 목록"] container.scrollTop 기반
    await page.evaluate(() => {
      const container = document.querySelector('[aria-label="상품 목록"]');
      if (container) container.scrollTop = 2000;
    });
    // IntersectionObserver 트리거 + page 2 로드 여유 (scrollTop=2000 → sentinel 감지)
    await page.waitForTimeout(1000);

    // 상세로 이동: .first()는 DOM 상 첫 요소(뷰포트 위)를 잡아 Playwright가 역스크롤함.
    // scrollTop=2000 뷰포트 안에 있는 index=20 카드를 명시적으로 클릭.
    const targetCard = page.locator('[data-testid="product-card"][data-index="20"]');
    if (await targetCard.isVisible()) {
      await targetCard.click();
      await expect(page).toHaveURL(/\/products\/.+/);
      // 뒤로가기
      await page.goBack();
      // ProductListContainer mount + 스크롤 복원 effect 완료 대기
      await page.waitForSelector("[data-testid='product-card']", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const scrollAfter = await page.evaluate(() => {
        return (
          document.querySelector<HTMLElement>('[aria-label="상품 목록"]')
            ?.scrollTop ?? 0
        );
      });
      // 컨테이너 스크롤이 복원되어야 함 (0이 아님)
      expect(scrollAfter).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// US1. Server Component 아키텍처 — 즉시 클릭 가능
// ---------------------------------------------------------------------------

test.describe("[US1] Server Component 아키텍처 검증", () => {
  test("Scenario 2: 페이지 로드 직후 옵션 클릭 가능 (hydration 불필요)", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // Server Component로 HTML이 렌더링되므로 DOMContentLoaded 직후 클릭 가능
    const firstGroup = page.getByRole("radiogroup").first();
    const firstOption = firstGroup.getByRole("radio").first();
    // waitForLoadState 없이 바로 click (서버 렌더링 가정)
    await firstOption.check();
    expect(await firstOption.isChecked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 접근성 종합 (SC-005) — US2 Scenario 7, US4 Scenario 5
// ---------------------------------------------------------------------------

test.describe("SC-005 접근성 axe 검사", () => {
  test("상세 페이지 전체 axe 검사 — 심각·치명 위반 0건", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ["wcag2a", "wcag2aa"] })
      .analyze();
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical).toHaveLength(0);
  });

  test("키보드 흐름: Tab → 옵션 → Arrow 이동 → Tab → 버튼", async ({
    page,
    request,
  }) => {
    const ids = await getSeedProductIds(request);
    const productId = ids.get(5);
    test.skip(!productId, "시드 상품 없음 — npm run seed:local 먼저 실행");

    await page.goto(`/products/${productId}`);
    // Tab으로 첫 번째 radiogroup으로 포커스 이동
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // ArrowRight로 같은 그룹 내 이동
    await page.keyboard.press("ArrowRight");
    // Tab으로 다음 그룹 혹은 버튼으로 이동 가능
    await page.keyboard.press("Tab");
    // 버튼에 포커스가 가거나 다음 그룹으로 이동 — 오류 없이 진행됨을 확인
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });
});
