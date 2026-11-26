# Implementation Plan: 상품 목록 무한 스크롤

**Branch**: `001-product-list` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: specs/001-product-list/spec.md

## Summary

설계서 K1 선정안: **목록 가상화 + 쿼리 캐시 유지 + 스크롤 위치 저장 + 첫 화면 SSR**로 무한 스크롤의 DOM 증가 문제와 뒤로가기 위치 소실을 함께 해결한다.

- `@tanstack/react-virtual` — 보이는 범위만 렌더링해 DOM 요소 수를 항상 뷰포트 카드 수 × 3 이하로 유지
- `useInfiniteQuery` (TanStack Query v5) — 커서 페이지네이션 + 캐시 보존 (gcTime 5분)
- Next.js Server Component `prefetchInfiniteQuery` — 첫 화면 HTML에 상품 포함 (SSR)
- `sessionStorage` — 스크롤 위치 보존; 만료 여부 판단 기준

**비교 대안 (나중에, 선택)**: CSS `content-visibility` / 가상화 없는 단순 무한 스크롤 — 설계서 K1 기각 대안

---

## Clarifications에서 확정한 값

| 항목 | 확정값 | 근거 |
| --- | --- | --- |
| 한 번에 불러올 상품 수 (page size) | **20개** | 모바일 뷰포트(~4개 카드)를 채우고 여유분 제공. 첫 로딩 속도와 API 호출 빈도의 균형 |
| 캐시 만료 시간 임계값 | **5분 (300,000 ms)** | TanStack Query `staleTime = gcTime = 5분`. 커머스 가격·재고 정확성과 복귀 편의성 균형 |
| 목록 끝 E2E 검증 방법 | **Playwright `page.route()` interceptor** — `/api/products` 응답을 10개·`hasMore: false`로 반환 | 시드 100,000개를 끝까지 스크롤 불가. 실제 DB 변경 없이 경계 조건 재현 |
| SSR 첫 화면 상품 수 | **20개** (page size와 동일) | 첫 번째 페이지를 서버에서 미리 조회해 HydrationBoundary로 전달 |

---

## Technical Context

**Language/Version**: TypeScript 6, Node ≥ 22

**Primary Dependencies**:
- Next.js 15 (App Router) — Server Component SSR + Route Handler
- `@tanstack/react-query` v5 — `useInfiniteQuery`, `HydrationBoundary`, `dehydrate` (Constitution 기술 스택 승인)
- `@tanstack/react-virtual` v3 — 가상화 (**신규**, Checkpoint A 승인 필요)
- Supabase JS v2 (`@supabase/ssr`) — PostgreSQL 조회
- Tailwind CSS — 스타일링

**Storage**: Supabase PostgreSQL. 로컬: `supabase start` / 원격: `.env.local`

**Testing**: Vitest (단위), Playwright + `@axe-core/playwright` (E2E + 접근성 자동 검사)

**Target Platform**: 모바일 Chrome 우선; iOS Safari 핵심 흐름 확인

**Performance Goals**:
- SC-001: 렌더링 카드 수 ≤ 뷰포트 카드 수 × 3 (E2E 인수 조건)
- SC-004: LCP ≤ 2.5초, CLS ≤ 0.1 (기준 환경, 프로덕션 빌드)

**Constraints**: Constitution 원칙 II — 1.8× CPU throttle (보정값), Slow 4G, 프로덕션 빌드

---

## Constitution Check

| 원칙 | 상태 | 비고 |
| --- | --- | --- |
| I. 최선책으로 구현, 목표로 측정 | ✓ | 설계서 K1 선정안 그대로 구현. 비교 대안(content-visibility 등)은 1차 배포 후 선택 |
| II. 기준 환경 고정 | ✓ | 로컬 prod 빌드, `001-product-list-measured` 태그로 측정 커밋 표시 |
| III. FE 몫 중심 | ✓ | Route Handler는 커서 페이지네이션 최소 구현; 서버 쪽 대기열·캐싱 없음 |
| IV. 범위 준수 | ✓ | 필터·검색·정렬 UI 없음. FR-001–FR-015 범위만 구현 |
| V. 정직한 기록 | ✓ | 목표 미달 시 수치·원인 그대로 기록 |

**품질 게이트 적용**

| 게이트 | 적용 |
| --- | --- |
| 기본 검사 (타입·단위·E2E) | ✓ PR 병합 조건 |
| 성능 예산 | 이번 스펙 첫 측정 후 `측정 중앙값 + 10%`로 예산 등록 |
| 성능 목표 (Core Web Vitals) | ✓ SC-004: LCP 2.5초, CLS 0.1 이하 |
| 접근성 | ✓ SC-005, FR-013–015 |
| 보안 | ✓ 클라이언트 코드에 서비스 키 없음 (Route Handler는 서버에서만 Supabase 조회) |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-product-list/
├── spec.md
├── plan.md              ← 이 파일
├── research.md          ← Phase 0
├── data-model.md        ← Phase 1
├── quickstart.md        ← Phase 1
├── contracts/
│   └── get-products.md  ← Phase 1
└── tasks.md             ← /speckit-tasks 생성
```

### Source Code

```text
src/
├── app/
│   ├── page.tsx                        # 교체: 상품 목록 화면 (Server Component)
│   ├── products/
│   │   └── [id]/
│   │       └── page.tsx               # S2 스텁 — 상세 화면 (뒤로가기 E2E에 필요)
│   └── api/
│       └── products/
│           └── route.ts               # GET /api/products (cursor pagination)
├── components/
│   ├── providers/
│   │   └── QueryProvider.tsx          # QueryClientProvider wrapper (Client Component)
│   └── product-list/
│       ├── ProductList.tsx            # 가상화 무한 스크롤 목록 (Client Component)
│       ├── ProductCard.tsx            # 상품 카드 (S6에서 재사용 예정)
│       ├── EndOfListBanner.tsx        # "상품을 모두 불러왔습니다" (role="status")
│       ├── ErrorRetry.tsx             # 오류 메시지 + 재시도 버튼 (role="alert")
│       └── ExpiryBanner.tsx           # 캐시 만료 배너 (role="status")
├── lib/
│   └── products/
│       └── queries.ts                 # fetchProductsPage() — Supabase 커서 쿼리
└── types/
    └── product.ts                     # ProductListItem, ProductsPage, ProductListState

tests/e2e/
├── layout.spec.ts                     # (기존)
└── product-list.spec.ts               # S1 E2E 테스트 (신규)
```

**src/app/layout.tsx 변경 사항**: `QueryProvider` wrapper 추가 (클라이언트 사이드 QueryClientProvider)

---

## 스크롤 복원 흐름

```
카드 클릭 시:
  sessionStorage['productListState'] = {
    savedAt: Date.now(),
    itemIndex: virtualItemIndex,
    scrollTop: virtualizer.scrollOffset
  }
  → 상세 페이지로 이동

목록 화면 복귀 시:
  state = sessionStorage['productListState']
  if (!state)                              → 첫 번째 상품부터 (새 탐색)
  if (Date.now() - state.savedAt > 5분)   → 만료 배너 표시 + 처음부터
  if (useInfiniteQuery.data 존재)          → virtualizer.scrollToOffset(state.scrollTop)
  이후: sessionStorage['productListState'] 제거
```

CACHE_EXPIRY_MS = 300_000 (5분). TanStack Query `staleTime = gcTime = CACHE_EXPIRY_MS`.

---

## 측정 시나리오

| 항목 | 방법 |
| --- | --- |
| SC-001 렌더링 카드 수 | 기준 환경, prod 빌드. 1,000개·5,000개 스크롤 시점에서 DOM 카드 수·메모리·프레임 드롭 3회 측정 후 중앙값 |
| SC-002 위치 복원 | 50번째 카드 → 상세 → 뒤로가기: 50번째 카드 50% 뷰포트 판정 + `/api/products` 재요청 수 + scrollY 차이(px) 기록 |
| SC-003 SSR | prod 빌드 HTML 소스에 첫 번째 상품 이름·가격 포함 여부 |
| SC-004 성능 목표 | Lighthouse CI (기준 환경). LCP·CLS 기록 |
| 추가 기록 | 설계서 K1 "위치 오차": scrollY 차이(px) — 통과/실패 기준 아님, 측정 기록용 |
