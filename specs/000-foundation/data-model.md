# Data Model: 기반 (Foundation)

**Spec ID**: S0 | **Date**: 2026-11-21

---

## 엔티티 관계

```
images (215행: 썸네일 200 + 상세 15)
  ↑ FK: thumbnail_image_id (NOT NULL)
products (100,000행) ──→ option_groups (옵션 있는 상품만, avg 1.5/상품)
  ↑ FK: detail_image_id (NULL 허용)        ↓ FK: group_id
                                        option_values (avg 3/그룹)
  ↓ FK: product_id
stocks (~410,000행)       ← option_value_ids[] FK (option_values.id 배열)
```

---

## 테이블 정의

### `images`

이미지 원본. 썸네일 200장 + 긴 상세 15장 = 215행.

```sql
CREATE TABLE images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path  text        NOT NULL UNIQUE,  -- "thumbnails/thumb-042.jpg"
  public_url    text        NOT NULL,
  type          text        NOT NULL CHECK (type IN ('thumbnail', 'detail')),
  size_bytes    int         NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

**storage_path 규칙**:
- 썸네일: `thumbnails/thumb-{000-199}.jpg` (3자리 zero-padded)
- 긴 상세: `details/detail-{00-14}.jpg` (2자리 zero-padded)

---

### `products`

상품 본체. 100,000행.

```sql
CREATE TABLE products (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,  -- 1자~100자 극단값 포함
  price               int         NOT NULL,  -- 원화 단위, 1,000~2,000,000
  category            text        NOT NULL
                        CHECK (category IN ('tops','bottoms','outerwear','shoes','bags','accessories')),
  attributes          jsonb       NOT NULL,  -- {"season":["spring"],"material":"cotton","style":"casual"}
  thumbnail_image_id  uuid        NOT NULL REFERENCES images(id),
  detail_image_id     uuid        REFERENCES images(id),  -- NULL이면 긴 상세 없음
  sort_order          int         NOT NULL UNIQUE,  -- 1-based, 등록 순서, 변경 불가 (FR-005)
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_sort_order ON products (sort_order);
CREATE INDEX idx_products_category   ON products (category);
CREATE INDEX idx_products_attributes ON products USING gin (attributes);
```

**attributes 구조** (S6 AI 쿼리 지원):

```jsonc
{
  "season":   ["spring", "summer"],    // string[] — "spring"|"summer"|"fall"|"winter"
  "material": "cotton",                // string
  "style":    "casual"                 // string — "casual"|"formal"|"sport"
}
```

---

### `option_groups`

옵션 단계. 예: "색상", "사이즈". 옵션 없는 상품은 행 없음.

```sql
CREATE TABLE option_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          text NOT NULL,       -- "색상" | "사이즈"
  display_order int  NOT NULL,
  UNIQUE (product_id, display_order)
);

CREATE INDEX idx_option_groups_product_id ON option_groups (product_id);
```

---

### `option_values`

옵션 그룹 내 개별 값. 예: "빨간색", "M".

```sql
CREATE TABLE option_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  value         text NOT NULL,
  display_order int  NOT NULL,
  UNIQUE (group_id, display_order)
);

CREATE INDEX idx_option_values_group_id ON option_values (group_id);
```

---

### `stocks`

옵션 조합별 재고. 옵션 없는 상품은 `option_value_ids = '{}'`.

```sql
CREATE TABLE stocks (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_value_ids uuid[]   NOT NULL DEFAULT '{}',
    -- 정렬 규칙: option_groups.display_order 오름차순으로 정렬한 option_value.id 배열
    -- 예) 색상(group order=1) Red=aaa, 사이즈(group order=2) M=bbb → '{aaa,bbb}'
  quantity         int      NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  UNIQUE (product_id, option_value_ids)
);

CREATE INDEX idx_stocks_product_id       ON stocks (product_id);
CREATE INDEX idx_stocks_option_value_ids ON stocks USING gin (option_value_ids);
```

**조합 유일성 보장**: 삽입 전 `option_value_ids`를 항상 group의 `display_order` 기준 오름차순으로 정렬. `UNIQUE(product_id, option_value_ids)`가 중복을 DB 레벨에서 차단.

---

## RLS (Row Level Security)

```sql
ALTER TABLE images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks        ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (anon key)
CREATE POLICY "public read" ON images        FOR SELECT USING (true);
CREATE POLICY "public read" ON products      FOR SELECT USING (true);
CREATE POLICY "public read" ON option_groups FOR SELECT USING (true);
CREATE POLICY "public read" ON option_values FOR SELECT USING (true);
CREATE POLICY "public read" ON stocks        FOR SELECT USING (true);

-- 쓰기: 서비스 키만 (시드 스크립트) → service role이 RLS를 우회하므로 별도 정책 불필요
```

---

## FR-004 데이터 분포 계획

### 앞 100개(sort_order 1~100) 고정 배치

| sort_order | 종류 | 비고 |
|-----------|------|------|
| 1, 11 | 품절 상품 (전 옵션 quantity=0) | |
| 2, 12 | 일부 옵션만 품절 | option_value_ids 조합 중 일부만 quantity=0 |
| 3, 13 | 옵션 없는 상품 | option_groups 없음, stocks 1건 |
| 4, 14 | 1단계 옵션 (색상 3개) | |
| 5, 15 | 2단계 옵션 (색상 2개 × 사이즈 3개 = 6조합) | |
| 6~20   | 긴 상세 이미지 있는 상품 | detail_image_id NOT NULL |
| 7      | 상품명 1자 | 극단값 |
| 8      | 상품명 100자 | 극단값 |
| 9      | 최저가 1,000원 | |
| 10     | 최고가 2,000,000원 | |

> sort_order 6~20은 긴 상세 이미지 고정 배치와 겹칠 수 있음. 겹치는 위치는 두 조건을 모두 충족하는 상품으로 생성.

### 전체 100,000개 비율

| 종류 | 비율 | 개수 |
|------|------|------|
| 옵션 없는 상품 | 20% | 20,000 |
| 1단계 옵션 | 30% | 30,000 |
| 2단계 옵션 | 50% | 50,000 |
| 품절 (전 옵션 quantity=0) | 전체의 5% | ~5,000 |
| 일부 옵션만 품절 | 옵션 있는 상품의 10% | ~8,000 |
| 긴 상세 이미지 있는 상품 | 15% | 15,000 |

### 재고 레코드 수 추정

| 종류 | 계산 | 레코드 수 |
|------|------|----------|
| 옵션 없는 상품 | 20,000 × 1건 | 20,000 |
| 1단계 옵션 (avg 3값) | 30,000 × 3건 | 90,000 |
| 2단계 옵션 (avg 2×3=6조합) | 50,000 × 6건 | 300,000 |
| **합계** | | **~410,000** |

---

## Supabase 무료 플랜 용량 추정

| 항목 | 계산 | 합계 |
|------|------|------|
| DB: products | 100k × ~500 bytes | ~50 MB |
| DB: stocks | 410k × ~150 bytes | ~62 MB |
| DB: option_groups + values | ~345k × ~100 bytes | ~35 MB |
| DB: images | 215 × ~200 bytes | <1 MB |
| **DB 합계** | | **~148 MB** (한도 500MB) ✓ |
| Storage: 썸네일 | 200 × ~300 KB | 60 MB |
| Storage: 긴 상세 | 15 × ~4 MB | 60 MB |
| **Storage 합계** | | **~120 MB** (한도 1 GB) ✓ |

---

## 이후 스펙 확장 규칙 (FR-005)

이후 스펙은 다음 중 하나만 가능하다:
1. 새 테이블 추가 (예: `carts`, `orders` — S3)
2. 기존 테이블에 nullable 컬럼 추가 (예: `products.sale_start_at` — S5)

기존 상품의 `sort_order`, `name`, `price`, `category`, `attributes`, `thumbnail_image_id` 필드와 `option_groups`, `option_values`, `stocks` 레코드는 변경 금지.
