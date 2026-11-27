# Tasks: 상품 목록 무한 스크롤

**Input**: specs/001-product-list/plan.md, spec.md, data-model.md, research.md, contracts/

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 다른 파일을 다루므로 병렬 실행 가능
- **[Story]**: 해당 태스크가 속하는 User Story (US1, US2, US3)

---

## Phase 1: Setup — 공통 인프라

**목적**: 모든 User Story가 공유하는 타입·의존성·클라이언트 인프라 준비

- [X] T001 패키지 설치: `npm install @tanstack/react-query@^5 @tanstack/react-virtual@^3` (plan.md 신규 라이브러리)
- [X] T002 [P] `src/types/product.ts` 생성 — `ProductListItem`, `ProductsPage`, `ProductListState` 타입 3개 정의 (data-model.md 타입 정의 그대로)
- [X] T003 [P] `src/components/providers/QueryProvider.tsx` 생성 — `"use client"`, `QueryClientProvider`, `QueryClient({ defaultOptions: { queries: { staleTime: 300_000, gcTime: 300_000 } } })`
- [X] T004 `src/app/layout.tsx` 수정 — `<body>` 안 콘텐츠를 `QueryProvider`로 래핑

**체크포인트**: `npx tsc --noEmit` 통과 → Foundation 시작 가능

---

## Phase 2: Foundation — API · DB 접근 계층

**목적**: 모든 User Story가 의존하는 Supabase 쿼리와 Route Handler 구현. 완료 전까지 US 구현 불가.

- [X] T005 `src/lib/products/queries.ts` 생성 — `fetchProductsPage(cursor: number | null, limit: number): Promise<ProductsPage>`. Supabase: `products` JOIN `images!thumbnail_image_id` LEFT JOIN `stocks`, `sort_order > cursor`, ORDER BY `sort_order` ASC, LIMIT `limit`. `isSoldOut = SUM(quantity) = 0`. research.md §4 쿼리 패턴 적용
- [X] T006 `src/app/api/products/route.ts` 생성 — GET Route Handler. `cursor` (number|없음), `limit` (number, 기본 20, 최대 100) 파라미터. 유효성 검사: cursor는 양의 정수, limit는 1–100 범위. contracts/get-products.md 응답 형식 준수 (`{ items, nextCursor, hasMore }`). `createServerSupabaseClient()` 사용 (서버 전용, 클라이언트 코드에서 직접 호출 금지)
- [X] T007 [P] `src/app/products/[id]/page.tsx` 생성 — S2 스텁. 상품 ID를 제목으로 표시 (`<h1>상품 {id}</h1>`). 뒤로가기 링크 포함 (`<a href="/">목록으로</a>`). 실제 상세 구현은 S2에서 처리.

**체크포인트**: `curl "http://localhost:3000/api/products?limit=5"` → 200 응답, items 5개 반환 → US1 시작 가능

---

## Phase 3: US1 — 무한 스크롤 목록 (SC-001, SC-003)

**목표**: 가상화된 무한 스크롤로 상품 목록 화면 완성. 1,000개·5,000개 스크롤 시점에서 렌더링 카드 수 ≤ 뷰포트 카드 수 × 3 (SC-001 — 첫 구현부터 적용하는 E2E 인수 조건). 첫 화면 HTML에 상품 포함 (SC-003).

**Independent Test**: `npm run test:e2e -- --grep "SC-001|SC-003"` 통과

### 구현

- [X] T008 [P] [US1] `src/components/product-list/ProductCard.tsx` 생성 — `ProductListItem` props. 대표 이미지(next/image, alt=상품명), 상품명(`<h2>`), 가격(원 단위 포맷), 품절 배지 (FR-006,007). 카드 전체를 `/products/{id}` 링크로 감쌈 (FR-008). `aria-label="{name} {price}원{isSoldOut ? ' 품절' : ''}"` (FR-014). `data-testid="product-card"` 추가 (E2E용). `role="listitem"` 없이 `<li>` 사용.
- [X] T009 [P] [US1] `src/components/product-list/EndOfListBanner.tsx` 생성 — `role="status"` div, 텍스트 "상품을 모두 불러왔습니다" (FR-003). 스크린리더가 나타날 때 자동으로 읽도록 `aria-live="polite"` 불필요 (role="status" 내장). `data-testid="end-of-list"` 추가.
- [X] T010 [P] [US1] `src/components/product-list/ErrorRetry.tsx` 생성 — `role="alert"` div (FR-005). 오류 메시지 텍스트 + "다시 시도" `<button>`. 버튼: `onClick` prop으로 재시도 함수 전달, 키보드 접근 가능(`<button>`은 기본 포커스 가능), 포커스 강제 이동 없음 (MUST NOT). `data-testid="error-retry"` 추가.
- [X] T011 [US1] `src/components/product-list/ProductList.tsx` 생성 — `"use client"`. `useInfiniteQuery` (queryKey: `['products']`, fetchFn, initialPageParam: null, getNextPageParam: lastPage.nextCursor). `useVirtualizer({ count: allItems.length, getScrollElement: () => containerRef.current, estimateSize: () => 240, overscan: 2 })`. 컨테이너 `role="list"`. 가상 아이템 위치: `position: absolute`, `top: virtualItem.start`. 범위 밖 아이템 자리 높이: `paddingTop/paddingBottom` 또는 전체 높이 wrapper (FR-002). `isFetchingNextPage` → 로딩 인디케이터 (FR-004). `hasNextPage && !isFetchingNextPage` → IntersectionObserver로 `fetchNextPage()` 트리거 (FR-001). `!hasNextPage` → EndOfListBanner (FR-003). `isError` → ErrorRetry (FR-005). `aria-live="polite"` 로딩 상태 (FR-015). 이 단계에서 스크롤 복원 로직 없음 (US2에서 추가).
- [X] T012 [US1] [US3] `src/app/page.tsx` 교체 — Server Component. `createQueryClient()` 인스턴스 생성 → `prefetchInfiniteQuery({ queryKey: ['products'], queryFn: ..., initialPageParam: null, pages: 1 })` (서버에서 첫 20개 조회, FR-012). `dehydrate(queryClient)` → `<HydrationBoundary>` → `<ProductList />`. `Suspense` 경계 추가 (로딩 fallback).

### 검증 (E2E — SC-001 인수 조건은 여기서 확인)

- [X] T013 [US1] `tests/e2e/product-list.spec.ts` 생성 — **SC-001 E2E**: Playwright route interceptor로 50페이지(1,000개) · 250페이지(5,000개) 분량 모의 응답 반환. 각 시점에서 `page.evaluate(() => document.querySelectorAll('[data-testid="product-card"]').length)` 로 DOM 카드 수 확인. 뷰포트 카드 수는 `page.evaluate(() => Math.ceil(window.innerHeight / 240))` 추정. 판정: 카드 수 ≤ 뷰포트 카드 수 × 3. 추가: 빠른 연속 스크롤 중 `/api/products` 중복 요청 없음 확인 (Edge Case).
- [X] T014 [US1] `tests/e2e/product-list.spec.ts` 추가 — **SC-003 SSR E2E**: `page.goto('/')` 후 `page.content()`에 첫 번째 상품 이름·가격 문자열 포함 여부 확인 (JS 실행 전 HTML 검증).
- [X] T015 [US1] `tests/e2e/product-list.spec.ts` 추가 — **목록 끝·오류·재시도 E2E** (3개 테스트): ① route interceptor로 10개·`hasMore:false` 반환 → `role="status"` "상품을 모두 불러왔습니다" 표시 확인. ② route interceptor로 두 번째 요청 abort → `role="alert"` 오류 메시지 + "다시 시도" 버튼 표시, 이전 상품 유지 확인. ③ "다시 시도" 클릭 → 목록 이어 붙음, 중복·누락 없음 확인. ④ 첫 번째 페이지 로딩 실패 (route abort) → 오류 안내 표시 확인.
- [X] T016 [US1] `tests/e2e/product-list.spec.ts` 추가 — **접근성 E2E** (SC-005): `checkA11y(page)` (@axe-core/playwright) — 심각·치명 위반 0건. 키보드 탐색: Tab으로 카드 이동, Enter로 `/products/{id}` 진입 확인.

**체크포인트**: `npm run test:e2e -- --grep "product-list"` 전체 통과 (SC-001 포함) → US2 시작 가능

---

## Phase 4: US2 — 스크롤 위치 복원 (SC-002)

**목표**: 상세에서 뒤로가기 시 50번째 카드 50% 이상 뷰포트 안 복원, 목록 재요청 0건. 5분 초과 복귀 시 만료 배너 표시.

**Independent Test**: `npm run test:e2e -- --grep "SC-002|expiry"` 통과

### 구현

- [X] T017 [P] [US2] `src/components/product-list/ExpiryBanner.tsx` 생성 — `role="status"`, `aria-live="polite"` (급하지 않은 상태 안내 — `role="alert"` 아님). 문구 "시간이 지나 목록을 새로 불러왔어요". 닫기 `<button aria-label="안내 닫기">`, 키보드 접근·실행 가능. `onDismiss` prop. `data-testid="expiry-banner"` 추가.
- [X] T018 [US2] `src/components/product-list/ProductList.tsx` 수정 — 스크롤 위치 저장·복원 로직 추가 (research.md §5 패턴 적용). **저장** (카드 클릭 시): `sessionStorage.setItem('productListState', JSON.stringify({ savedAt, itemIndex, scrollTop }))`. **복원** (마운트 시): state 없으면 그대로. `savedAt` 기준 5분 초과 → `showExpiryBanner=true`, sessionStorage 제거. 유효 → `rowVirtualizer.scrollToOffset(state.scrollTop)`. **뒤로가기 포커스**: 복원 후 클릭했던 카드 링크에 `focus()` (US2 Scenario 4, FR-013).

### 검증 (E2E)

- [X] T019 [US2] `tests/e2e/product-list.spec.ts` 추가 — **SC-002 E2E**: 50번째 카드까지 스크롤 → 카드 클릭 → `/products/{id}` → 뒤로가기. 판정 ①: 50번째 카드 `getBoundingClientRect()` 기준 50% 이상 뷰포트 안 (통과/실패). 판정 ②: 뒤로가기 중 `/api/products` 네트워크 요청 0건 (통과/실패). **추가 기록**: 상세 진입 직전 `scrollY`와 뒤로가기 직후 `scrollY` 차이(px) — `console.log` 또는 테스트 첨부 파일로 기록 (통과/실패 기준 아님, 설계서 K1 "위치 오차").
- [X] T020 [US2] `tests/e2e/product-list.spec.ts` 추가 — **만료 배너 E2E**: `page.clock.setFixedTime(Date.now() + 6 * 60 * 1000)` 으로 6분 경과 모의. 상세 → 뒤로가기 → `data-testid="expiry-banner"` 표시, "안내 닫기" 버튼 키보드로 실행 → 배너 사라짐 확인.

**체크포인트**: `npm run test:e2e -- --grep "product-list"` 전체 통과 → Phase 5로 이동

---

## Phase 5: 검증 · 측정 준비 · 기록

**목적**: CI 최종 통과 확인 → Checkpoint B (사용자가 기준 환경에서 직접 측정) → 측정 결과 기록

- [X] T021 CI 최종 확인 — `npx tsc --noEmit && npm run test && npm run build` 순차 실행 후 모두 통과. 빌드 성공 확인. (Playwright E2E는 `npm run test:e2e`로 별도 확인)
- [X] T022 `specs/001-product-list/verification.md` 작성 — spec.md의 Acceptance Scenarios (US1 5개, US2 5개, US3 2개) + Edge Cases + SC-001–SC-006 각각: 통과/미달/미측정 상태, 근거(테스트 이름 또는 측정 파일명). **[Checkpoint B 측정 후 SC-004 항목 채움]**
- [X] T023 `docs/adr/001-product-list.md` 작성 — 형식: 문제(K1 무한 스크롤 성능·위치 소실) · 대안 비교(설계서 K1 기각 대안 그대로) · 선택 이유 · 측정 결과(SC-001·SC-002·SC-004 중앙값, 3회 원값 포함). **[Checkpoint B 측정 후 결과 채움]**
- [X] T024 `README.md` 갱신 — 진행 표(S1 행: 완료 표시) · 성능 수치 표(SC-001·SC-002·SC-004 측정 중앙값 기입). **[Checkpoint B 측정 후 작성]**

---

## Dependencies & Execution Order

### Phase 의존 관계

```
Phase 1 (Setup) → Phase 2 (Foundation) → Phase 3 (US1) → Phase 4 (US2) → Phase 5
```

- T006은 T005에 의존 (Supabase 쿼리 함수 필요)
- T011은 T008·T009·T010에 의존 (하위 컴포넌트 import)
- T012는 T011에 의존 (ProductList 필요)
- T013–T016은 T012에 의존 (목록 화면 완성 후 E2E)
- T018은 T011·T017에 의존 (ProductList 수정 + ExpiryBanner)
- T019·T020은 T018에 의존

### Parallel Opportunities

```
# Phase 1 병렬 실행 (T001 완료 후)
Task T002: src/types/product.ts
Task T003: src/components/providers/QueryProvider.tsx

# Phase 2 병렬 실행 (T004 완료 후)
Task T005: src/lib/products/queries.ts (→ T006 의존)
Task T007: src/app/products/[id]/page.tsx (독립)

# Phase 3 구현 병렬 실행 (T006 완료 후)
Task T008: ProductCard.tsx
Task T009: EndOfListBanner.tsx
Task T010: ErrorRetry.tsx
(T011은 T008·T009·T010 완료 후 시작)

# Phase 4 병렬 실행 (T012 완료 후)
Task T017: ExpiryBanner.tsx (T018 이전에 필요, 하지만 T013-T016과 병렬 가능)
```

---

## Implementation Strategy

### MVP (US1만)

1. Phase 1: Setup (T001–T004)
2. Phase 2: Foundation (T005–T007)
3. Phase 3: US1 (T008–T016)
4. **검증**: SC-001 E2E 통과 확인

### 전체 완성

1. MVP 완성
2. Phase 4: US2 (T017–T020) — 위치 복원 추가
3. Phase 5: 측정·기록 (T021–T024)

---

## 총계

| Phase | 태스크 수 | 비고 |
| --- | --- | --- |
| Phase 1 Setup | 4 (T001–T004) | |
| Phase 2 Foundation | 3 (T005–T007) | |
| Phase 3 US1 | 9 (T008–T016) | SC-001·SC-003 E2E 포함 |
| Phase 4 US2 | 4 (T017–T020) | SC-002 E2E 포함 |
| Phase 5 측정·기록 | 4 (T021–T024) | Checkpoint B 측정 후 T022–T024 완성 |
| **합계** | **24** | |

**병렬 실행 가능 태스크**: T002·T003, T005·T007, T008·T009·T010·T017
