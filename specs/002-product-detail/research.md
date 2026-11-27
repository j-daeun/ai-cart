# Research: 즉시 반응하는 상품 상세

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

---

## 1. 구현 방식 — 설계서 K3 선정안 근거

### 문제. 화면은 보이는데 JS 실행이 끝날 때까지 버튼이 안 눌림

| 대안 | 결론 |
| --- | --- |
| **상세 화면 전체 CSR** | 기각 — 비교 대안(나중에). JS 번들 전체가 하이드레이션 대상이 되어 TBT 증가. 상품명·이미지 같은 정적 콘텐츠까지 JS로 렌더링하는 오버헤드 발생 |
| **서버 컴포넌트 기본, 옵션·버튼 영역만 클라이언트 컴포넌트 (선택)** | 채택 — 정적 콘텐츠(상품명·가격·이미지)는 JS 없이 HTML로 전달. 사용자가 조작하는 옵션·버튼만 하이드레이션 대상으로 한정 → TBT 감소. 설계서 K3 선정안 |

**선택 이유**: Next.js App Router에서 Server Component가 기본값이므로 추가 설정 없이 선정안 구현 가능. 하이드레이션 대상을 `ProductDetailInteractive` 하나로 좁히는 것이 TBT 개선의 핵심.

---

## 2. 옵션 선택 접근성 — 라디오 그룹 패턴 (spec.md Q2 근거)

| 대안 | 결론 |
| --- | --- |
| 커스텀 `div`/`button` 그룹 + ARIA | 기각 — `role="radiogroup"`, `role="radio"`, `aria-checked`, 방향키 KeyboardEvent 직접 구현 필요. 접근성 오류 가능성이 높고 코드가 복잡해짐 |
| **네이티브 `<input type="radio">` + `<fieldset>/<legend>` (선택)** | 채택 — 브라우저가 방향키 이동, `aria-checked`, 단일 선택(FR-008) 동작을 기본 제공. 품절 옵션은 `disabled` 속성으로 선택 불가 처리(FR-009·FR-020). 추가 JS 없이 FR-008·FR-018 충족 |

**라디오 그룹 ARIA 구조**:
```html
<form autoComplete="off">
  <fieldset>
    <legend>색상</legend>  <!-- group.name -->
    <input type="radio" id="v1" name="group-{groupId}" value="{valueId}" />
    <label for="v1">빨간색</label>

    <input type="radio" id="v2" name="group-{groupId}" value="{valueId}" disabled />
    <label for="v2">파란색 <span aria-hidden="true">(품절)</span></label>
    <!-- disabled 자체가 스크린리더에서 "dimmed" / "unavailable"로 읽힘 (FR-020) -->
    <!-- "품절" 텍스트는 색상만 사용 금지(FR-009) 충족용 -->
  </fieldset>
</form>
```

**방향키 동작**: 같은 `name` 속성을 공유하는 라디오 버튼 그룹 내에서 브라우저가 Arrow Up/Down/Left/Right로 이동·선택을 기본 제공. `disabled` 옵션은 건너뜀.

---

## 3. 옵션 상태 초기화 — spec.md Q3 근거

| 대안 | 결론 |
| --- | --- |
| Zustand 스토어 | 기각 — spec.md Q3: 상태를 화면 밖에 보관하지 않는다 |
| URL 쿼리 파라미터 | 기각 — spec.md Q3: URL에 상태 미보관 |
| `sessionStorage` | 기각 — spec.md Q3: storage 미사용. S1 스크롤 위치 저장과 목적이 달라 혼용 금지 |
| **React `useState` + `<form autoComplete="off">` (선택)** | 채택 — 컴포넌트 언마운트 시 자연스럽게 초기화. `autoComplete="off"`로 bfcache 브라우저 폼 자동 복원 방지. FR-022 충족 |

**bfcache 주의사항**: Next.js App Router가 SPA 내비게이션을 처리하므로 뒤로가기·앞으로가기 시 컴포넌트가 재마운트됨. 그러나 브라우저가 `<input type="radio">` 상태를 HTML 폼 복원 메커니즘으로 복원할 수 있으므로 `<form autoComplete="off">`를 명시적으로 설정.

---

## 4. 오류·404 처리 패턴 (Next.js App Router)

| 케이스 | 처리 방식 | 비고 |
| --- | --- | --- |
| 유효하지 않은/존재하지 않는 상품 ID (FR-004) | `fetchProductDetail()`에서 `notFound()` 호출 → `app/products/[id]/not-found.tsx` | "상품을 찾을 수 없습니다" + "목록으로" 링크 |
| Supabase 조회 실패 (FR-005) | `fetchProductDetail()`에서 `throw new Error(...)` → `app/products/[id]/error.tsx` (Client Component) | "다시 시도" 버튼 → `reset()` → Server Component 재렌더링 |

**Route Handler 불필요**: 오류 재시도는 `error.tsx`의 `reset()` 함수로 처리. 클라이언트에서 별도 API를 호출하지 않음.

---

## 5. Supabase 단건 조회 쿼리 패턴

```ts
// src/lib/products/queries.ts (추가)
const { data, error } = await supabase
  .from('products')
  .select(`
    id, name, price,
    thumbnail:images!thumbnail_image_id(public_url),
    detail:images!detail_image_id(public_url),
    option_groups(
      id, name, display_order,
      option_values(id, value, display_order)
    ),
    stocks(option_value_ids, quantity)
  `)
  .eq('id', productId)
  .single()
```

`!thumbnail_image_id` / `!detail_image_id` — Supabase foreign key hint로 올바른 `images` JOIN 선택.

**품절 판단 로직** (서버에서 계산 후 클라이언트에 전달):
```ts
// 특정 optionValue가 포함된 모든 stocks 조합의 quantity 합계
function isOptionValueSoldOut(valueId: string, stocks: StockEntry[]): boolean {
  const relevant = stocks.filter(s => s.optionValueIds.includes(valueId))
  if (relevant.length === 0) return false
  return relevant.every(s => s.quantity === 0)
}

// 전체 품절 (구매·장바구니 버튼 비활성화 고정)
function isProductAllSoldOut(stocks: StockEntry[]): boolean {
  return stocks.every(s => s.quantity === 0)
}
```

---

## 6. S1 스크롤 복원 회귀 방지 (SC-007)

S2에서 `app/products/[id]/page.tsx`를 교체하면 S1의 `ProductCard.tsx`가 가리키는 `href="/products/{id}"` 링크 동작이 그대로 유지되어야 함.

- S1 `ProductCard.tsx`는 `<a href="/products/{id}">` 링크를 사용
- 카드 클릭 시 `sessionStorage['productListState']` 저장 후 이동
- S2 Server Component가 같은 URL 패턴(`/products/[id]`)에 응답하므로 별도 변경 불필요
- SC-007 E2E: `tests/e2e/product-list.spec.ts`의 SC-002 테스트가 여전히 통과하는지 S2 구현 후 확인

---

## 7. B3 외부 스크립트 지연 로드 (보조)

S2 구현 범위에서 추가 외부 스크립트(Analytics 등)가 없으면 적용 없음. 향후 외부 스크립트가 추가될 경우 `next/script strategy="afterInteractive"` 또는 `strategy="lazyOnload"` 적용.

## 8. B4 CI 성능 예산 (보조)

측정 완료 후 `.lighthouserc.yml`에 등록:
```yaml
# TBT 예산 = SC-001 측정 중앙값 × 1.1 (올림)
# INP 예산 = SC-002 측정 중앙값 × 1.1 (올림)
```

측정 전 PR은 예산 초과 시 CI 실패시키지 않음 (Constitution 품질 게이트).
