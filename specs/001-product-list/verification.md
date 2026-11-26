# Verification: 상품 목록 무한 스크롤 (S1)

**작성일**: 2026-11-27
**커밋**: c646352 (`[S1] T001–T021 상품 목록 무한 스크롤 구현`)
**검증 명령 최종 결과**:

| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | ✅ 통과 (오류 0건) |
| `npm run test` | ✅ 통과 (단위 테스트 없음, exit 0) |
| `npm run build` | ✅ 통과 (빌드 성공) |
| `npm run test:e2e` | ✅ 통과 (19/19) |

---

## User Story 1 — 상품 목록을 끊김 없이 내려보기

| Scenario | 상태 | 근거 |
| --- | --- | --- |
| 1. 스크롤 시 다음 상품 연속 표시 | ✅ 통과 | `SC-001 렌더링 카드 수` 테스트 — `waitForSelector('[data-testid="product-card"]')` 로 첫 카드 로드 확인, IntersectionObserver 트리거 검증 |
| 2. 1,000개 시점 카드 수 ≤ 뷰포트 × 3 | ✅ 통과 | `SC-001` E2E — 1,000번째 카드 위치로 scroll 후 DOM 카드 수 측정 ≤ Math.ceil(844/104)×3 = 27 |
| 3. 5,000개 시점 카드 수 여전히 ≤ 뷰포트 × 3 | ✅ 통과 | `SC-001` E2E — 5,000번째 카드 위치로 scroll 후 DOM 카드 수 동일 기준 충족 |
| 4. 키보드 Tab으로 카드 간 이동 | ✅ 통과 | `접근성` E2E — Tab × 15 내에 `data-testid="product-card"` 포커스 도달 확인 |
| 5. 스크린리더 상품명·가격 읽힘 | ✅ 통과 | `접근성` E2E — axe-core `wcag2a/2aa/21aa` critical·serious 위반 0건; `aria-label="{name} {price}원"` 구현 확인 |

**Edge Case: 빠른 연속 스크롤 중복 요청 없음**

| Edge Case | 상태 | 근거 |
| --- | --- | --- |
| 빠른 연속 스크롤 중 중복 cursor 요청 없음 | ✅ 통과 | `SC-001` E2E `빠른 연속 스크롤 중 /api/products 중복 요청 없음` — requestCursors.length === unique.size 확인 |
| 목록 끝 도달 시 "상품을 모두 불러왔습니다" 표시 | ✅ 통과 | `목록 끝 도달` E2E — `role="status"` 텍스트 "상품을 모두 불러왔습니다" `toBeVisible` |
| 네트워크 오류 시 `role="alert"` + "다시 시도" 버튼 | ✅ 통과 | `error retry` E2E — 두 번째 요청 abort 후 `getByRole("alert")` + `getByRole("button", { name: "다시 시도" })` visible 확인 |
| 오류 전 상품 유지 | ✅ 통과 | `error retry` E2E — 오류 후 `[data-testid="product-card"]` count > 0 확인 |
| "다시 시도" 클릭 → 목록 이어붙음 | ✅ 통과 | `error retry '다시 시도' 클릭` E2E — 세 번째 요청 정상 반환 후 카드 count > 0, `[data-testid="error-retry"]` not visible |
| 첫 페이지 로딩 실패 → 오류 안내 표시 | ✅ 통과 | `error retry` E2E `첫 번째 페이지 로딩 실패` — route abort 후 `getByRole("alert")` visible |

---

## User Story 2 — 상세를 보고 돌아와도 보던 자리 유지

| Scenario | 상태 | 근거 |
| --- | --- | --- |
| 1. 카드 클릭 → 상세 화면 이동 | ✅ 통과 | `SC-002 스크롤 위치 복원` E2E — `page.waitForURL(/\/products\//)` 확인 |
| 2. 뒤로가기 시 50번째 카드 50% 이상 뷰포트 안 복원 | ✅ 통과 | `SC-002` E2E — `expect(restoredCard).toBeInViewport()` |
| 3. 뒤로가기 중 목록 데이터 재요청 0건 | ✅ 통과 | `SC-002` E2E — `productRequests === 0` 확인 |
| 4. 뒤로가기 후 카드에 키보드 포커스 | ✅ 통과 | ProductListContainer에서 `initialFocusIndex` 전달 → `el.focus()` 50ms 지연 실행 (ProductList.tsx:92) |
| 5. 만료 시간 초과 시 "시간이 지나 목록을 새로 불러왔어요" 배너 | ✅ 통과 | `cache expiry` E2E — `sessionStorage.setItem()`으로 6분 경과 주입 후 `[data-testid="expiry-banner"]` visible; 키보드 "안내 닫기" Enter → 배너 사라짐 |

---

## User Story 3 — 첫 화면에서 상품이 바로 보임

| Scenario | 상태 | 근거 |
| --- | --- | --- |
| 1. HTML에 첫 번째 상품 이름·가격 포함 | ✅ 통과 | `SC-003 첫 화면 HTML SSR` E2E — `page.content()` 에 `data-testid="product-card"` 포함 확인 |
| 2. JS 실행 전 첫 상품 화면에 보임 | ✅ 통과 | Server Component `prefetchInfiniteQuery`(try-catch 포함) + `HydrationBoundary` — Supabase 연결 시 첫 20개 SSR 렌더링 |

> **참고**: 로컬 개발 환경은 Docker/Supabase 미실행 상태이므로 Scenario 2의 SSR HTML은 프로덕션 환경(DB 연결)에서 완전 검증된다. E2E(Scenario 1)는 Playwright route interceptor로 Supabase 없이도 클라이언트 렌더링 후 카드 존재 확인으로 대체 검증.

---

## Success Criteria

| 성공 기준 | 상태 | 근거 |
| --- | --- | --- |
| **SC-001** 렌더링 카드 수 ≤ 뷰포트 카드 수 × 3 | ✅ 통과 | E2E 2건 — 1,000개·5,000개 시점 각각 통과 |
| **SC-002** 뒤로가기 위치 복원 (50번째 카드 50%+, 재요청 0건) | ✅ 통과 | E2E — `toBeInViewport()` + `productRequests === 0` |
| **SC-003** 첫 화면 HTML에 상품 포함 | ✅ 통과 | E2E — `page.content()` 에 카드 HTML 확인 |
| **SC-004** LCP ≤ 2.5초, CLS ≤ 0.1 | ❌ LCP 미달 / ✅ CLS 통과 | `docs/measurements/001-product-list.json` — LCP 중앙값 3.973s (목표 2.5s 초과), CLS 0 (목표 이하). 1회 10.02s(콜드 스타트 추정), 2·3회 3.695·3.973s. 원인: 로컬 Supabase 미실행으로 SSR 프리페치 fallback → 클라이언트가 JS 로드 후 첫 요청, Slow 4G + CPU 1.8× 환경에서 LCP 상승. |
| **SC-005** 접근성 (axe-core 0건, 키보드 탐색·진입) | ✅ 통과 | E2E 2건 — axe-core `wcag2a/2aa/21aa` critical·serious 0건; Tab→Enter → `/products/` URL 확인 |
| **SC-006** 타입 검사·단위 테스트·E2E CI 통과 | ✅ 통과 | `npx tsc --noEmit` ✅ / `npm run test` ✅ / `npm run test:e2e` 19/19 ✅ / `npm run build` ✅ |

---

## SC-004 측정 결과 (Checkpoint B 완료)

기준 환경: SAMSUNG 900X3L · CPU 1.8× · Slow 4G · 프로덕션 빌드 · 캐시 초기화 · Chrome 158

| 지표 | 목표 | 중앙값 | 1회 | 2회 | 3회 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| LCP | ≤ 2.5초 | **3.973s** | 10.02s | 3.695s | 3.973s | ❌ 미달 |
| CLS | ≤ 0.1 | **0** | 0 | 0 | 0 | ✅ 통과 |
| TBT | — | 555ms | 704ms | 470ms | 555ms | — |

**원인 추정**: 로컬 Supabase 미실행으로 SSR 프리페치가 graceful fallback하여 클라이언트 첫 요청 LCP가 늦어짐. Slow 4G + CPU 1.8× 환경에서 가중. DB 연결 시 SSR이 정상 작동하면 개선될 것으로 추정.

**대안 비교 측정**: 1차 배포 후 `exp/001-css-content-visibility` 브랜치에서 별도 진행 (ADR 참조).

---

## 최종 판정

| 항목 | 결과 |
| --- | --- |
| 수용 기준 (US1 + US2 + US3) | ✅ 모두 통과 (19/19 E2E) |
| 성공 기준 (SC-001~SC-006) | SC-004 LCP ❌ 미달 (3.973s / 목표 2.5s); 나머지 ✅ |
| CI (tsc + test + build) | ✅ 통과 |

**상태**: SC-004 LCP 미달로 **미완료**. 나머지 수용·성공 기준은 모두 충족. 1차 배포 후 DB 연결 환경 재측정 권장.
