# Data Model: 즉시 반응하는 상품 상세

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

---

## 타입 (`src/types/product.ts` 추가분)

### ProductDetail

서버 컴포넌트에서 Supabase 조회 후 클라이언트 컴포넌트에 props로 전달하는 상품 상세 타입.

```ts
/** 상품 상세 화면 전체 데이터 (서버에서 조회, 클라이언트에 props로 전달) */
export type ProductDetail = {
  id: string;
  name: string;
  price: number;               // 원 단위 정수
  thumbnailUrl: string;        // 대표 이미지 URL
  detailImageUrl: string | null; // 긴 상세 이미지 URL. 없으면 null (FR-002)
  optionGroups: OptionGroup[]; // 없으면 빈 배열 (FR-012)
  stocks: StockEntry[];
};
```

### OptionGroup

옵션 그룹 한 개 (예: "색상", "사이즈").

```ts
/** 옵션 그룹 한 개. 예: 색상, 사이즈 */
export type OptionGroup = {
  id: string;
  name: string;          // 예: "색상", "사이즈"
  displayOrder: number;  // 화면 표시 순서 (오름차순)
  options: OptionValue[];
};
```

### OptionValue

옵션 그룹 내의 단일 선택 항목.

```ts
/** 옵션 그룹 내 개별 값. 예: "빨간색", "M" */
export type OptionValue = {
  id: string;
  value: string;         // 예: "빨간색", "M"
  displayOrder: number;
  isSoldOut: boolean;    // 이 값이 포함된 모든 stocks 조합의 quantity 합계 = 0 (FR-009·FR-020)
};
```

### StockEntry

상품 단건 조회 시 함께 조회되는 재고 조합. 서버에서 품절 판단에 사용하고 클라이언트에도 전달.

```ts
/** 옵션 조합별 재고. 옵션 없는 상품은 optionValueIds = [] */
export type StockEntry = {
  optionValueIds: string[];  // 비어있으면 옵션 없는 상품
  quantity: number;
};
```

---

## 클라이언트 상태 (`ProductDetailInteractive.tsx` 내부)

`useState`만 사용. Zustand·URL·sessionStorage·localStorage 사용 금지 (FR-022).

```ts
// 선택된 옵션 상태 — groupId → 선택된 valueId
// 초기값: {} (빈 객체 = 아무것도 선택 안 된 상태)
type SelectedOptions = Record<string, string>;

// ----- 파생 상태 계산 -----

// 모든 그룹에서 옵션이 선택됐는지
const isAllSelected = optionGroups.every(g => g.id in selectedOptions);

// 전체 품절 여부
const isAllSoldOut = stocks.every(s => s.quantity === 0);

// 버튼 활성화 조건 (FR-010·FR-011·FR-012)
//   - 옵션 없는 상품 (optionGroups.length === 0): 항상 활성화 (단, 전체 품절 제외)
//   - 옵션 있는 상품: 모든 그룹 선택 완료 시 활성화
const isButtonEnabled = !isAllSoldOut && (optionGroups.length === 0 || isAllSelected);
```

---

## DB 엔티티 (S0 schema, 읽기 전용)

### products (기존, S2 사용 컬럼)

| 컬럼 | 타입 | S2 사용 |
| --- | --- | --- |
| id | uuid | ✓ ProductDetail.id |
| name | text | ✓ ProductDetail.name |
| price | int | ✓ ProductDetail.price |
| thumbnail_image_id | uuid | ✓ images JOIN (대표 이미지) |
| detail_image_id | uuid | ✓ images JOIN (긴 상세 이미지, nullable) |
| sort_order | int | S2 미사용 |
| category, attributes, created_at | — | S2 미사용 |

### images (기존, S2 JOIN)

| 컬럼 | 타입 | S2 사용 |
| --- | --- | --- |
| id | uuid | thumbnail_image_id / detail_image_id JOIN 조건 |
| public_url | text | ✓ thumbnailUrl, detailImageUrl |
| type | text | 'thumbnail' / 'detail' (JOIN 선택 시 참고) |

### option_groups (기존, S2 조회)

| 컬럼 | 타입 | S2 사용 |
| --- | --- | --- |
| id | uuid | ✓ OptionGroup.id |
| product_id | uuid | JOIN 조건 |
| name | text | ✓ OptionGroup.name |
| display_order | int | ✓ OptionGroup.displayOrder |

### option_values (기존, S2 조회)

| 컬럼 | 타입 | S2 사용 |
| --- | --- | --- |
| id | uuid | ✓ OptionValue.id |
| group_id | uuid | JOIN 조건 |
| value | text | ✓ OptionValue.value |
| display_order | int | ✓ OptionValue.displayOrder |

### stocks (기존, S2 조회 — 품절 판단)

| 컬럼 | 타입 | S2 사용 |
| --- | --- | --- |
| product_id | uuid | JOIN 조건 |
| option_value_ids | uuid[] | ✓ StockEntry.optionValueIds |
| quantity | int | ✓ StockEntry.quantity, 품절 판단 |

---

## 품절 판단 로직

### OptionValue 단위 품절 (`OptionValue.isSoldOut`)

```
isSoldOut =
  이 value.id가 포함된 모든 stocks 행의 quantity 합계 === 0
```

서버에서 계산 후 클라이언트에 전달 (추가 클라이언트 연산 불필요).

### 전체 품절 (`isAllSoldOut`)

```
isAllSoldOut = 모든 stocks 행의 quantity === 0
```

옵션 없는 상품: stocks 1행 (optionValueIds = []), quantity = 0 → 전체 품절.

---

## 상태 전이

```
[ProductDetailInteractive 마운트]
  → selectedOptions = {} (초기 상태, FR-022)
  → isButtonEnabled 계산

[옵션 클릭]
  → selectedOptions[groupId] = valueId
  → isAllSelected 재계산 → isButtonEnabled 재계산
  → 같은 옵션 재클릭 → 상태 변화 없음 (radio 특성, FR-008)

[품절 옵션 클릭]
  → disabled 속성으로 클릭 불가 (FR-009)

[컴포넌트 언마운트 (페이지 이탈)]
  → selectedOptions 소멸 (FR-022)
  → 재진입 시 {} 초기 상태로 시작
```
