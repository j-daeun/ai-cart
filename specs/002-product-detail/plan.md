# Implementation Plan: 즉시 반응하는 상품 상세

**Branch**: `002-product-detail` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: specs/002-product-detail/spec.md

## Summary

설계서 K3 선정안: **서버 컴포넌트를 기본으로, 옵션·버튼 영역만 클라이언트 컴포넌트로 나눔**. 상품명·가격·이미지처럼 정적인 콘텐츠는 JS 없이 HTML로 전달하고, 사용자가 직접 조작하는 옵션 선택과 구매·장바구니 버튼만 하이드레이션 대상으로 한정해 TBT를 줄인다.

- `app/products/[id]/page.tsx` (Server Component) — Supabase 직접 조회 → 상품 정보·이미지 HTML로 렌더링
- `ProductDetailInteractive.tsx` (Client Component) — 옵션 선택 상태(`useState`) + 구매·장바구니 버튼
- 옵션 그룹: 네이티브 `<fieldset>/<legend>/<input type="radio">` — 방향키 이동·단일 선택이 브라우저 기본 제공
- 옵션 상태: 컴포넌트 외부에 보관하지 않음 → 화면 이탈 시 자동 초기화 (FR-022)

**비교 대안 (나중에, 선택)**: 상세 화면 전체를 클라이언트에서 렌더링하는 방식 — 설계서 K3 기각 대안

---

## Clarifications에서 확정한 값

| 항목 | 확정값 | 근거 |
| --- | --- | --- |
| 옵션 그룹 마크업 | `<fieldset>/<legend>` + `<input type="radio">/<label>` 네이티브 패턴 | spec.md Q2 — 방향키 이동, 단일 선택, aria-checked가 브라우저 기본 제공. FR-008·FR-018 추가 JS 없이 충족 |
| 품절 옵션 처리 | `disabled` 속성 + 라벨에 "품절" 텍스트 추가 | spec.md Q2 — 색상만으로 구분 금지(FR-009), 스크린리더 `disabled` 인식(FR-020) |
| 옵션 상태 보관 위치 | `ProductDetailInteractive.tsx` 내부 `useState`만 사용. Zustand·URL·storage 사용 금지 | spec.md Q3 — 화면을 떠나면 상태 소멸(FR-022) |
| 브라우저 폼 자동 복원 방지 | 옵션 영역 `<form autoComplete="off">` | spec.md Q3 — bfcache 뒤로가기·앞으로가기 후에도 초기 상태(FR-022) |
| 긴 상세 이미지 없는 상품 | `detail_image_id IS NULL`이면 이미지 영역 미표시 (빈 영역·깨진 이미지 없음) | spec.md Q1 (FR-002) |
| 이미지 alt 형식 | 대표: `"{상품명}"` / 긴 상세: `"{상품명} 상세 이미지"` | spec.md Q1 (FR-019) |

---

## Technical Context

**Language/Version**: TypeScript strict, Node ≥ 22

**Primary Dependencies**:
- Next.js 15 (App Router) — Server Component SSR + error.tsx/not-found.tsx
- Supabase JS v2 (`@supabase/ssr`) — PostgreSQL 단건 조회 (서버 전용)
- Tailwind CSS — 스타일링
- Playwright + `@axe-core/playwright` — E2E + 접근성 자동 검사

**신규 라이브러리 없음** — 기존 Constitution 기술 스택으로 구현 가능

**Storage**: Supabase PostgreSQL. S0 schema 읽기 전용 (products, images, option_groups, option_values, stocks)

**Testing**: Vitest (단위), Playwright + `@axe-core/playwright` (E2E + 접근성)

**Target Platform**: 모바일 Chrome 우선; iOS Safari 핵심 흐름 확인

**Performance Goals**:
- SC-001: TBT ≤ 200ms (기준 환경, 프로덕션 빌드)
- SC-002: 옵션 클릭 INP ≤ 200ms

**Constraints**: Constitution 원칙 II — 1.8× CPU throttle (보정값), Slow 4G, 프로덕션 빌드. 신규 라이브러리 추가 금지 (Constitution 기술 스택 준수).

---

## Constitution Check

| 원칙 | 상태 | 비고 |
| --- | --- | --- |
| I. 최선책으로 구현, 목표로 측정 | ✓ | 설계서 K3 선정안(서버 컴포넌트 기본) 그대로 구현. 비교 대안(전체 CSR)은 1차 배포 후 선택 |
| II. 기준 환경 고정 | ✓ | 로컬 prod 빌드, `002-product-detail-measured` 태그로 측정 커밋 표시 |
| III. FE 몫 중심 | ✓ | Supabase 단건 조회만 추가. 서버 쪽 대기열·캐싱 없음. Route Handler 불필요 |
| IV. 범위 준수 | ✓ | 긴 상세 이미지 최적화(S4), LCP·CLS(K6), 옵션 반응 추가 최적화(K4), S3 버튼 동작 없음 |
| V. 정직한 기록 | ✓ | 목표 미달 시 수치·원인 그대로 기록 |

**품질 게이트 적용**

| 게이트 | 적용 |
| --- | --- |
| 기본 검사 (타입·단위·E2E) | ✓ PR 병합 조건 |
| 성능 예산 | 이번 스펙 첫 측정 후 `측정 중앙값 + 10%`로 `.lighthouserc.yml` 예산 등록 (SC-001 TBT, SC-002 INP) |
| 성능 목표 (Core Web Vitals) | ✓ SC-001 TBT ≤ 200ms, SC-002 INP ≤ 200ms |
| 접근성 | ✓ SC-005: 키보드 목록→상세→옵션→버튼, axe 심각·치명 0건 |
| 보안 | ✓ Supabase 조회는 서버 컴포넌트에서만 (Supabase service key 클라이언트 노출 없음) |
| S1 회귀 없음 | ✓ SC-007: S1 SC-002 (50번째 상품 위치 복원) E2E 여전히 통과해야 함 |

---

## Project Structure

### Documentation (this feature)

```text
specs/002-product-detail/
├── spec.md
├── plan.md              ← 이 파일
├── research.md          ← Phase 0
├── data-model.md        ← Phase 1
├── quickstart.md        ← Phase 1
├── contracts/
│   └── get-product.md   ← Phase 1 (데이터 접근 계약)
└── tasks.md             ← /speckit-tasks 생성
```

### Source Code

```text
src/
├── app/
│   └── products/
│       └── [id]/
│           ├── page.tsx          # Server Component — Supabase 직접 조회, 상품 정보·이미지 렌더링
│           ├── not-found.tsx     # 404 UI — 상품 없음 안내 + "목록으로" 링크 (FR-004)
│           └── error.tsx         # 에러 UI — 오류 안내 + "다시 시도" 버튼 (Client Component, FR-005)
├── components/
│   └── product-detail/
│       └── ProductDetailInteractive.tsx  # Client Component — 옵션 선택 + 구매·장바구니 버튼
└── lib/
    └── products/
        └── queries.ts            # 추가: fetchProductDetail() (서버 전용)

src/types/
└── product.ts                    # 추가: ProductDetail, OptionGroup, OptionValue, StockEntry

tests/e2e/
└── product-detail.spec.ts        # S2 E2E 테스트 (신규)
```

**변경 사항**:
- `src/app/products/[id]/page.tsx` — S1 스텁을 S2 Server Component로 교체
- `src/lib/products/queries.ts` — `fetchProductDetail()` 추가
- `src/types/product.ts` — S2 타입 추가

---

## 서버·클라이언트 경계 설계 (K3 핵심)

```text
page.tsx  (Server Component — JS 없음)
├── fetchProductDetail(id)  → Supabase 직접 조회
├── 상품명, 가격           → <h1>, <p> (HTML)
├── 대표 이미지            → <img> (HTML, alt="{상품명}")
├── 긴 상세 이미지         → <img> 또는 없음 (HTML, alt="{상품명} 상세 이미지")
└── <ProductDetailInteractive optionGroups={...} stocks={...} />

ProductDetailInteractive.tsx  ('use client' — 하이드레이션 대상)
├── useState: selectedOptions: Record<groupId, valueId>
├── <form autoComplete="off">
│   └── 각 optionGroup →
│       <fieldset>
│         <legend>{group.name}</legend>
│         각 option →
│           <input type="radio" name={groupId} value={valueId}
│                  disabled={isSoldOut} onChange={...} />
│           <label>{option.value}{isSoldOut && " 품절"}</label>
├── isButtonEnabled 계산: 모든 그룹 선택 완료 && !isAllSoldOut
└── <ActionButtons isEnabled={isButtonEnabled} isAllSoldOut={isAllSoldOut} />
    └── <button disabled={!isEnabled} aria-disabled={!isEnabled}>구매하기</button>
        <button disabled={!isEnabled} aria-disabled={!isEnabled}>장바구니</button>
```

**TBT에 미치는 영향**: 하이드레이션 대상이 `ProductDetailInteractive` 하나로 한정됨. 상품 정보·이미지는 서버에서 렌더링돼 JS 파싱·실행 비용 없음.

---

## 옵션 품절 판단 로직

서버 컴포넌트에서 `fetchProductDetail()`이 각 `OptionValue`의 `isSoldOut`을 계산해 클라이언트에 전달:

```
optionValue.isSoldOut =
  이 value.id가 포함된 모든 stocks 행의 quantity 합계 === 0
```

전체 품절 판단 (버튼 비활성화):
```
isAllSoldOut = stocks.every(s => s.quantity === 0)
```

---

## 오류·404 처리

| 케이스 | 처리 | 파일 |
| --- | --- | --- |
| 유효하지 않은 상품 ID (FR-004) | `notFound()` 호출 → `not-found.tsx` | `app/products/[id]/not-found.tsx` |
| Supabase 조회 오류 (FR-005) | `throw new Error(...)` → `error.tsx` 에러 경계 + `reset()` 재시도 | `app/products/[id]/error.tsx` |

`error.tsx`의 `reset()` 재호출 → Server Component 재렌더링 → Supabase 재조회. 추가 Route Handler 불필요.

---

## 측정 시나리오

| 항목 | 방법 |
| --- | --- |
| SC-001 TBT | 기준 환경, prod 빌드. 상세 페이지 Lighthouse 실행. 3회 측정, 중앙값과 원값 기록 |
| SC-002 INP | 기준 환경, prod 빌드. 성능 패널 — 옵션 버튼 클릭 → 선택 상태 반영까지 측정. 3회, 중앙값 기록 |
| SC-003 JS 전송 크기 | prod 빌드 Network 패널 — 상세 페이지 로드 시 JS 번들 크기 (gzip) 기록 |
| SC-004 360px 레이아웃 | 360px 뷰포트 E2E — `document.documentElement.scrollWidth > window.innerWidth` false 확인 |
| SC-005 접근성 | Playwright E2E — 키보드 목록→상세→옵션(방향키)→버튼 흐름 완료 / `AxeBuilder` 심각·치명 0건 |
| SC-006 기본 검사 | `npx tsc --noEmit` / `npm run test` / `npm run build` / `npm run test:e2e` |
| SC-007 S1 회귀 | `tests/e2e/product-list.spec.ts` SC-002 테스트 (50번째 상품 위치 복원) 여전히 통과 |
