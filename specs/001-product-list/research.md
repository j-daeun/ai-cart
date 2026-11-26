# Research: 상품 목록 무한 스크롤

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

## 1. 구현 방식 — 설계서 K1 선정안 근거

### 문제 1. DOM 증가로 스크롤 끊김 · 메모리 증가

| 대안 | 결론 |
| --- | --- |
| 무한 스크롤 그대로 | 기각 — 저사양 기기에서 끊김·메모리 무제한 증가 |
| 페이지네이션 회귀 | 기각 — 탐색 흐름 끊김, 모바일 커머스 관행과 다름 |
| CSS `content-visibility` | 기각 — DOM은 그대로라 메모리 미해결. 비교 대안(나중에)으로 보류 |
| **목록 가상화 (선택)** | 보이는 범위만 렌더링 → DOM 요소 수 항상 소수 유지 |

### 문제 2. 가상화 이후 뒤로가기 위치 소실 · 첫 화면 공백

| 대안 | 결론 |
| --- | --- |
| 브라우저 기본 스크롤 복원 | 기각 — 가상화 목록에서 DOM 위치가 어긋남, 데이터 재요청 발생 |
| 상세를 모달로 띄우기 | 기각 — 상세 직접 URL 공유·SEO 처리 복잡 |
| 목록 데이터를 `localStorage`에 저장 | 기각 — 오래된 가격·재고 노출 위험, 용량 제한 |
| **쿼리 캐시 유지 + 위치 저장 + SSR (선택)** | 불러온 데이터를 메모리에 보존(TanStack Query), 위치를 `sessionStorage`에 저장, 첫 화면 SSR로 HTML에 상품 포함 |

---

## 2. `@tanstack/react-virtual` v3

**Decision**: `useVirtualizer`를 사용해 가상화 구현

**Rationale**:
- TanStack Query와 같은 생태계 — API 설계 일관성, 의존성 최소화
- `overscan: 2` 설정 시 뷰포트 위아래 각 2개 추가 렌더링 → 뷰포트 카드 수 + 4개
  - 뷰포트에 4개 카드가 보일 때: 최대 8개 렌더링 → SC-001 기준(12개) 충분히 이내
- `estimateSize` 초기값: 240px (카드 높이 추정치, 실측 후 조정 가능)
- 화면 밖 아이템이 있던 자리의 높이는 `paddingStart`/`paddingEnd` 또는 절대 위치로 유지 → FR-002 "자리의 높이 유지" 충족

**Alternatives considered**: `react-window`(추가 의존성, 업데이트 빈도 낮음), `react-virtuoso`(더 큰 번들)

---

## 3. Next.js App Router + TanStack Query SSR 패턴

```
Server Component (app/page.tsx)
  ↓  createQueryClient()
  ↓  await queryClient.prefetchInfiniteQuery({ queryKey, queryFn, initialPageParam: null, pages: 1 })
  ↓  <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductList />  ← Client Component
     </HydrationBoundary>
```

- `QueryClientProvider`는 `src/components/providers/QueryProvider.tsx` (Client Component)로 분리해 `app/layout.tsx`에 추가
- Server Component에서는 `new QueryClient()`를 직접 생성 (매 요청마다 새 인스턴스)
- 첫 화면 HTML에 상품 포함 → SC-003, FR-012 충족

**staleTime / gcTime 설정**:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000,  // 5분: 이 시간 안엔 background refetch 없음
      gcTime: 300_000,     // 5분: inactive query가 메모리에서 삭제되는 시간
    },
  },
})
```

---

## 4. 커서 페이지네이션 쿼리

**Supabase 쿼리 (`lib/products/queries.ts`)**:

```sql
SELECT
  p.id, p.name, p.price, p.sort_order,
  i.public_url   AS thumbnail_url,
  COALESCE(SUM(s.quantity), 0) = 0  AS is_sold_out
FROM products p
JOIN   images i  ON i.id = p.thumbnail_image_id
LEFT JOIN stocks s ON s.product_id = p.id
WHERE  p.sort_order > :cursor      -- 첫 페이지는 WHERE 생략
GROUP  BY p.id, i.public_url, p.sort_order
ORDER  BY p.sort_order ASC
LIMIT  :limit
```

- 커서: `sort_order` (유일값, B-tree 인덱스 `idx_products_sort_order` 존재 — S0 마이그레이션)
- `nextCursor`: `items[items.length - 1].sortOrder` (또는 `null`)
- `hasMore`: `items.length === limit`

Supabase JS SDK 패턴:
```ts
let query = supabase
  .from('products')
  .select(`id, name, price, sort_order, images!thumbnail_image_id(public_url), stocks(quantity)`)
  .order('sort_order', { ascending: true })
  .limit(limit)

if (cursor) {
  query = query.gt('sort_order', cursor)
}
```

---

## 5. 스크롤 위치 복원 구현

**저장** (카드 클릭 시):
```ts
sessionStorage.setItem('productListState', JSON.stringify({
  savedAt: Date.now(),
  itemIndex: index,            // 가상화 인덱스
  scrollTop: rowVirtualizer.scrollOffset,
}))
```

**복원** (ProductList 마운트 시):
```ts
const raw = sessionStorage.getItem('productListState')
if (!raw) return  // 새 탐색 → 처음부터

const state = JSON.parse(raw) as ProductListState
sessionStorage.removeItem('productListState')  // 한 번만 사용

if (Date.now() - state.savedAt > CACHE_EXPIRY_MS) {
  setShowExpiryBanner(true)
  return  // 처음부터 (TanStack Query가 fresh data 로딩)
}

// 캐시 유효: 위치 복원
// useInfiniteQuery data가 hydration으로 이미 존재
rowVirtualizer.scrollToOffset(state.scrollTop, { align: 'start' })
```

---

## 6. 목록 끝 · 오류 E2E 검증 (Playwright route interception)

### 목록 끝 (`hasMore: false`)
```ts
await page.route('**/api/products*', async route => {
  const url = new URL(route.request().url())
  const cursor = url.searchParams.get('cursor')
  if (!cursor) {
    // 첫 페이지: 10개 반환, 다음 없음
    await route.fulfill({
      json: {
        items: Array.from({ length: 10 }, (_, i) => mockProductItem(i + 1)),
        nextCursor: null,
        hasMore: false,
      },
    })
  } else {
    await route.continue()
  }
})
await expect(
  page.getByRole('status').filter({ hasText: '상품을 모두 불러왔습니다' })
).toBeVisible()
```

### 네트워크 오류
```ts
await page.route('**/api/products*', route => route.abort('failed'))
await expect(
  page.getByRole('alert')
).toBeVisible()
await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
```

---

## 7. 접근성 (axe-core/playwright)

```ts
// E2E에서 주요 상태마다 axe-core 실행
import { checkA11y } from '@axe-core/playwright'

await checkA11y(page, undefined, {
  detailedReport: true,
  detailedReportOptions: { html: true },
})
```

**ARIA 구조**:
- 목록 컨테이너: `role="list"` (또는 `<ul>`)
- 카드 아이템: `role="listitem"` (또는 `<li>`)
- 카드 링크: `<a href="/products/{id}" aria-label="{상품명} {가격}원">`
- 품절: `<span aria-hidden="true">품절</span>` + `aria-label`에 "품절" 포함
- 로딩: `<div aria-live="polite" aria-label="상품 불러오는 중">`
- 오류: `<div role="alert">`
- 목록 끝: `<div role="status">`
- 만료 배너: `<div role="status">` + 닫기 `<button aria-label="안내 닫기">`
- 뒤로가기 포커스: 클릭한 카드 링크에 `focus()` (FR-009, User Story 2 Scenario 4)
