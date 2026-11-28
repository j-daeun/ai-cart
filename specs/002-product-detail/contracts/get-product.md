# Data Access Contract: 상품 단건 조회

**경로**: `src/lib/products/queries.ts` (추가)
**작성**: 2026-11-27

---

## fetchProductDetail

서버 컴포넌트 전용 함수. Supabase를 직접 조회하며, Route Handler를 거치지 않는다.

### 시그니처

```ts
async function fetchProductDetail(productId: string): Promise<ProductDetail>
```

### 동작

1. Supabase에서 `products` 단건 + 연관 테이블(images, option_groups, option_values, stocks) 조회
2. 상품 없음(`data === null`) → `notFound()` 호출 (Next.js, `not-found.tsx` 렌더링)
3. Supabase 오류(`error !== null`) → `throw new Error(error.message)` (`error.tsx` 에러 경계가 처리)
4. 성공 → `ProductDetail` 반환 (option_groups `display_order` 오름차순, option_values `display_order` 오름차순 정렬)

### Supabase 쿼리 패턴

```ts
const { data, error } = await supabase
  .from('products')
  .select(`
    id,
    name,
    price,
    thumbnail:images!thumbnail_image_id(public_url),
    detail:images!detail_image_id(public_url),
    option_groups(
      id,
      name,
      display_order,
      option_values(
        id,
        value,
        display_order
      )
    ),
    stocks(
      option_value_ids,
      quantity
    )
  `)
  .eq('id', productId)
  .single()
```

> `!thumbnail_image_id` / `!detail_image_id` — Supabase foreign key hint. `products` 테이블이 `images`를 두 개의 FK(`thumbnail_image_id`, `detail_image_id`)로 참조하므로 각각 힌트를 명시해야 올바른 JOIN이 선택된다.

### 반환 타입 변환 (`data` → `ProductDetail`)

```ts
// option_groups: display_order 오름차순 정렬
// 각 group의 option_values: display_order 오름차순 정렬
// OptionValue.isSoldOut: 해당 value.id가 포함된 모든 stocks의 quantity 합계 === 0
// ProductDetail.detailImageUrl: detail이 null이면 null

const productDetail: ProductDetail = {
  id: data.id,
  name: data.name,
  price: data.price,
  thumbnailUrl: data.thumbnail?.public_url ?? '',
  detailImageUrl: data.detail?.public_url ?? null,
  optionGroups: sortedOptionGroups.map(group => ({
    id: group.id,
    name: group.name,
    displayOrder: group.display_order,
    options: sortedOptionValues.map(value => ({
      id: value.id,
      value: value.value,
      displayOrder: value.display_order,
      isSoldOut: isOptionValueSoldOut(value.id, data.stocks),
    })),
  })),
  stocks: data.stocks.map(s => ({
    optionValueIds: s.option_value_ids,
    quantity: s.quantity,
  })),
}
```

### 에러 처리 요약

| 케이스 | 처리 | 결과 |
| --- | --- | --- |
| 정상 | `ProductDetail` 반환 | 상세 화면 렌더링 |
| 상품 없음 | `notFound()` | `app/products/[id]/not-found.tsx` 렌더링 (FR-004) |
| Supabase 오류 | `throw new Error(...)` | `app/products/[id]/error.tsx` 렌더링 (FR-005) |

---

## UI 계약

### `app/products/[id]/not-found.tsx`

- 메시지: "상품을 찾을 수 없습니다" (또는 유사 문구)
- "목록으로" 링크: `<a href="/">` (FR-004)

### `app/products/[id]/error.tsx`

- 메시지: "상품 정보를 불러오지 못했습니다" (또는 유사 문구)
- "다시 시도" 버튼: `onClick={reset}` (Next.js `reset` prop, FR-005)

---

## 연관 타입

[data-model.md](../data-model.md) — `ProductDetail`, `OptionGroup`, `OptionValue`, `StockEntry`
