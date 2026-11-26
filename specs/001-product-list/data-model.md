# Data Model: 상품 목록 무한 스크롤

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

---

## 타입 (`src/types/product.ts`)

### ProductListItem

API 응답 단위이자 화면에 카드로 렌더링되는 최소 단위.

```ts
type ProductListItem = {
  id: string;           // products.id (UUID)
  name: string;         // products.name
  price: number;        // products.price (원 단위 정수, 1,000 ~ 2,000,000)
  thumbnailUrl: string; // images.public_url (thumbnail 타입)
  isSoldOut: boolean;   // stocks 테이블 모든 재고 합계 = 0
  sortOrder: number;    // products.sort_order — 커서로 사용
}
```

> **S6 재사용**: 이 타입은 AI 쇼핑 어시스턴트 대화 화면에서도 쓰인다. 추후 필드 추가 시 하위 호환 유지.

### ProductsPage

단일 페이지(API 응답) 단위.

```ts
type ProductsPage = {
  items: ProductListItem[];
  nextCursor: number | null; // 다음 요청 cursor = items.at(-1)?.sortOrder. null이면 마지막 페이지
  hasMore: boolean;          // items.length === limit 이면 true
}
```

### ProductListState

`sessionStorage`에 저장되는 스크롤 위치 상태.

```ts
type ProductListState = {
  savedAt: number;    // Date.now() — 저장 시각 (ms)
  itemIndex: number;  // 클릭된 카드의 가상화 인덱스 (0-based)
  scrollTop: number;  // virtualizer.scrollOffset (px)
}
```

---

## DB 엔티티 (S0 schema, 읽기 전용)

### products

| 컬럼 | 타입 | S1 사용 |
| --- | --- | --- |
| id | uuid | ✓ ProductListItem.id |
| name | text | ✓ ProductListItem.name |
| price | int | ✓ ProductListItem.price |
| thumbnail_image_id | uuid | ✓ images JOIN에 사용 |
| sort_order | int | ✓ 커서 · 정렬 기준 |
| category, attributes, detail_image_id, created_at | — | S1에서 미사용 |

### images (JOIN)

| 컬럼 | 타입 | S1 사용 |
| --- | --- | --- |
| id | uuid | thumbnail_image_id JOIN 조건 |
| public_url | text | ✓ ProductListItem.thumbnailUrl |
| type | text | 'thumbnail' 필터링 (JOIN 대상) |

### stocks (LEFT JOIN, 집계)

| 컬럼 | 타입 | S1 사용 |
| --- | --- | --- |
| product_id | uuid | JOIN 조건 |
| quantity | int | ✓ SUM(quantity) = 0 → isSoldOut |

---

## 쿼리 계약

### 커서 조건

- `sort_order` 는 `products` 테이블에서 `UNIQUE`, B-tree 인덱스 `idx_products_sort_order` 존재
- 첫 번째 페이지: cursor 없음 (WHERE 생략)
- 다음 페이지: `WHERE sort_order > cursor`
- 중복 없이 연속 — sort_order 는 등록 순서, 변경 불가 (S0 FR-005)

### 페이지 크기

- 기본: 20개 (plan에서 확정)
- Route Handler에서 `limit` 쿼리 파라미터로 override 가능 (최대 100, 테스트 목적)

### 품절 판단

- `stocks` 테이블 LEFT JOIN + `SUM(quantity) = 0`
- 옵션 없는 상품: stocks 행이 1개, `option_value_ids = '{}'`
- 옵션 있는 상품: stocks 행 여러 개, 모든 행의 quantity 합계가 0이면 품절

---

## 상태 전이

```
[ProductList 마운트]
  ├─ sessionStorage 없음 → 첫 번째 상품부터 (새 탐색)
  ├─ sessionStorage 있음 + savedAt 5분 이내 → 위치 복원 (캐시 유효)
  └─ sessionStorage 있음 + savedAt 5분 초과 → 만료 배너 + 첫 번째 상품

[스크롤 중]
  ├─ 목록 하단 접근 → useInfiniteQuery fetchNextPage()
  ├─ isFetchingNextPage=true → 로딩 인디케이터 표시 (FR-004)
  ├─ 오류 발생 → ErrorRetry 표시 (FR-005)
  └─ hasMore=false → EndOfListBanner 표시 (FR-003)

[카드 클릭]
  → sessionStorage 저장 → 상세 화면 이동
```
