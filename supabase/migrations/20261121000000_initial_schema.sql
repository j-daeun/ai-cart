-- =============================================================================
-- AI Cart Initial Schema
-- S0: Foundation — 5 tables, 7 indexes, RLS policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- images
-- 썸네일 200장 + 긴 상세 15장 = 215행
-- storage_path 규칙:
--   썸네일: thumbnails/thumb-{000-199}.jpg (3자리 zero-padded)
--   긴 상세: details/detail-{00-14}.jpg   (2자리 zero-padded)
-- ---------------------------------------------------------------------------
CREATE TABLE images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path  text        NOT NULL UNIQUE,
  public_url    text        NOT NULL,
  type          text        NOT NULL CHECK (type IN ('thumbnail', 'detail')),
  size_bytes    int         NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- products
-- 100,000행. sort_order는 1-based, 등록 순서, 변경 불가 (FR-005)
-- attributes 구조: {"season":["spring"],"material":"cotton","style":"casual"}
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  price               int         NOT NULL CHECK (price >= 1000 AND price <= 2000000),
  category            text        NOT NULL
                        CHECK (category IN ('tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories')),
  attributes          jsonb       NOT NULL,
  thumbnail_image_id  uuid        NOT NULL REFERENCES images(id),
  detail_image_id     uuid        REFERENCES images(id),
  sort_order          int         NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_sort_order ON products (sort_order);
CREATE INDEX idx_products_category   ON products (category);
CREATE INDEX idx_products_attributes ON products USING gin (attributes);

-- ---------------------------------------------------------------------------
-- option_groups
-- 옵션 단계 (예: "색상", "사이즈"). 옵션 없는 상품은 행 없음.
-- ---------------------------------------------------------------------------
CREATE TABLE option_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          text NOT NULL,
  display_order int  NOT NULL,
  UNIQUE (product_id, display_order)
);

CREATE INDEX idx_option_groups_product_id ON option_groups (product_id);

-- ---------------------------------------------------------------------------
-- option_values
-- 옵션 그룹 내 개별 값 (예: "빨간색", "M")
-- ---------------------------------------------------------------------------
CREATE TABLE option_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  value         text NOT NULL,
  display_order int  NOT NULL,
  UNIQUE (group_id, display_order)
);

CREATE INDEX idx_option_values_group_id ON option_values (group_id);

-- ---------------------------------------------------------------------------
-- stocks
-- 옵션 조합별 재고. 옵션 없는 상품은 option_value_ids = '{}'
-- option_value_ids 정렬 규칙: option_groups.display_order 오름차순
-- ---------------------------------------------------------------------------
CREATE TABLE stocks (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_value_ids uuid[]   NOT NULL DEFAULT '{}',
  quantity         int      NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  UNIQUE (product_id, option_value_ids)
);

CREATE INDEX idx_stocks_product_id       ON stocks (product_id);
CREATE INDEX idx_stocks_option_value_ids ON stocks USING gin (option_value_ids);

-- =============================================================================
-- RLS (Row Level Security)
-- 쓰기: service role이 RLS를 우회하므로 별도 쓰기 정책 불필요 (시드 스크립트 전용)
-- 읽기: anon key로 공개 읽기 허용
-- =============================================================================
ALTER TABLE images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON images        FOR SELECT USING (true);
CREATE POLICY "public read" ON products      FOR SELECT USING (true);
CREATE POLICY "public read" ON option_groups FOR SELECT USING (true);
CREATE POLICY "public read" ON option_values FOR SELECT USING (true);
CREATE POLICY "public read" ON stocks        FOR SELECT USING (true);
