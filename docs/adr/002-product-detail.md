# ADR S2: 상품 상세 — Server Component + Client Component 경계 분리

**날짜**: 2026-11-27
**상태**: SC-001 TBT 미달 — 나머지 기준 충족
**스펙**: specs/002-product-detail/spec.md
**커밋**: 0a4abb9

---

## 문제

상품 상세에서 옵션(색상·사이즈)을 클릭하면 반응이 느리게 느껴진다. 저사양 기준 환경에서 JS 번들이 클수록 메인 스레드가 오래 막혀(TBT) 옵션 클릭이 지연된다. 동시에 상품명·가격·이미지처럼 정적 콘텐츠는 JS 없이 HTML로 먼저 보여줘야 한다.

설계서 K3 (docs/design-decisions.md) "상품 상세 화면의 성능"에 대한 구현 결정 기록.

---

## 대안 비교

| 대안 | 장점 | 한계 |
| --- | --- | --- |
| 전체 클라이언트 렌더링 (CSR) | 구현 단순 | JS 도착 전 빈 화면, TBT 집중 |
| 전체 서버 렌더링 (SSR + 별도 옵션 API) | 첫 화면 빠름 | 옵션 상호작용에 추가 API 왕복 필요 |
| **서버 컴포넌트 기본 + 클라이언트 컴포넌트 옵션·버튼 ← 선택 (K3)** | 정적 콘텐츠 HTML로 전달, 옵션만 하이드레이션 | S1 공유 번들이 커서 TBT가 여전히 높음 |

---

## 선택한 방식

**Next.js 15 App Router 서버 컴포넌트 기본 + `ProductDetailInteractive` 클라이언트 컴포넌트**

### 서버·클라이언트 경계

| 역할 | 컴포넌트 | 렌더링 |
| --- | --- | --- |
| 상품명·가격·이미지 | `app/products/[id]/page.tsx` (Server Component) | HTML — 하이드레이션 대상 아님 |
| 옵션 그룹 + 구매·장바구니 버튼 | `ProductDetailInteractive.tsx` (Client Component) | 하이드레이션 |

### 세부 구성

| 역할 | 선택 | 값 |
| --- | --- | --- |
| 데이터 접근 | `fetchProductDetail()` 서버 전용 함수 | Supabase 직접 조회, Route Handler 없음 |
| 옵션 그룹 마크업 | `<fieldset>/<legend>/<input type="radio">` 네이티브 | 방향키 이동·단일 선택 브라우저 기본 제공 |
| 품절 옵션 처리 | `disabled` 속성 + "품절" 텍스트 | 색상만으로 구분 금지 (FR-009·FR-020) |
| 옵션 상태 | `ProductDetailInteractive.tsx` 내부 `useState`만 | 화면 이탈 시 자동 초기화 (FR-022) |
| 브라우저 폼 복원 방지 | `<form autoComplete="off">` | bfcache 뒤로가기·앞으로가기 후 초기 상태 보장 |
| 404 처리 | `notFound()` → `not-found.tsx` | PGRST116(no row found) |
| 에러 처리 | `throw new Error()` → `error.tsx` | Supabase 오류 → "다시 시도" 버튼 |

### 선택 이유

1. **정적 콘텐츠 Server Component**: 상품명·가격·이미지는 사용자 상호작용이 없으므로 하이드레이션 비용이 없어야 한다. Server Component로 처리하면 해당 HTML은 클라이언트 JS 대상에서 제외된다.
2. **옵션만 Client Component**: 옵션 선택(onClick, onChange)은 클라이언트 상태가 필요하다. 하이드레이션 대상을 최소화해 메인 스레드 점유를 줄인다.
3. **네이티브 radio 패턴**: 커스텀 JS 없이 방향키 탐색, 단일 선택, `disabled` 속성이 브라우저에서 기본 제공된다. accessibility(FR-018·FR-019·FR-020)를 추가 코드 없이 충족한다.
4. **Route Handler 없음**: fetchProductDetail()은 서버 컴포넌트에서 직접 Supabase를 호출하므로 불필요한 HTTP 왕복이 없다.

---

## 측정 결과

기준 환경: SAMSUNG 900X3L · CPU 1.8× · Slow 4G · 프로덕션 빌드 · 캐시 초기화 · Chrome 158

| 지표 | 목표 | 중앙값 | 1회 | 2회 | 3회 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| TBT (SC-001) | ≤ 200ms | **556ms** | 769ms | 523ms | 556ms | ❌ 미달 |
| LCP | — | **4.01s** | 8.324s | 3.957s | 4.01s | — |
| CLS | ≤ 0.1 | **0** | 0 | 0 | 0 | ✅ 통과 |
| INP (SC-002) | ≤ 200ms | 미측정 | — | — | — | — |

**TBT 미달 원인 추정**: S1 공유 번들(TanStack Query + React Virtual = ~103KB)이 상품 상세 페이지에서도 로드된다. 상세 페이지는 이 라이브러리를 직접 사용하지 않지만 Next.js가 `chunks/` 공유 청크로 묶어서 전달한다. 1.8× CPU throttle + Slow 4G 조건에서 103KB 파싱 비용이 TBT에 집중되는 것으로 추정.

**대응**: 수치 조작 없이 미달 사실 그대로 기록. 성능 예산은 중앙값 × 1.1 = 612ms로 등록해 회귀만 방지. 목표 달성은 S4(S1 번들 최적화) 혹은 별도 실험 브랜치에서 route-based code splitting 적용 후 재측정으로 검토.

---

## 비교 대안 (나중에, 선택)

1차 배포 후 시간이 나면 `exp/002-csr-only` 브랜치를 main에서 따서 전체 CSR 방식을 같은 조건으로 측정 비교한다. 결과는 이 ADR에 추가. 비교 브랜치는 main에 병합하지 않는다.
