/**
 * scripts/seed.ts
 * 고정 시드값(42)으로 100,000개 상품 + 옵션 + 재고 + 이미지를 Supabase에 생성.
 *
 * 사용:
 *   npm run seed             # 원격 (.env.local)
 *   npm run seed:local       # 로컬 Docker (.env.test.local via dotenv-cli)
 *
 * 환경 변수:
 *   SUPABASE_URL             # 필수
 *   SUPABASE_SERVICE_ROLE_KEY # 필수
 *   SEED_VALUE               # 선택, 기본 42
 *
 * 계약: specs/000-foundation/contracts/seed-cli.md
 */

import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker";
import fs from "fs";
import os from "os";
import path from "path";
import { generateImages } from "./generate-images.js";

// ---------------------------------------------------------------------------
// 환경 변수
// SUPABASE_URL 없으면 NEXT_PUBLIC_SUPABASE_URL로 폴백 (.env.local 호환)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_VALUE = parseInt(process.env.SEED_VALUE ?? "42", 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[seed] Error: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------
const TOTAL_PRODUCTS = 100_000;
const BATCH_SIZE = 1_000;
const BUCKET = "product-images";

const CATEGORIES = ["tops", "bottoms", "outerwear", "shoes", "bags", "accessories"] as const;
type Category = (typeof CATEGORIES)[number];

const SEASONS = ["spring", "summer", "fall", "winter"] as const;
const STYLES = ["casual", "formal", "sport"] as const;

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

/** 오류 발생 시 모든 테이블을 순서대로 삭제 (FR-008 원자성 보장) */
async function rollback() {
  console.error("[seed] Rolling back — deleting all rows...");
  for (const table of ["stocks", "option_values", "option_groups", "products", "images"] as const) {
    // neq로 전체 행 삭제 (Supabase에서 DELETE without filter는 금지)
    const { error } = await supabase
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.error(`[seed] rollback warning: ${table} delete failed — ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  console.log(`[seed] Starting seed (value=${SEED_VALUE})...`);

  faker.seed(SEED_VALUE);

  // 1. 연결 확인
  const { error: pingError } = await supabase.from("images").select("id").limit(1);
  if (pingError) {
    console.error(`[seed] Error: Cannot connect to Supabase — ${pingError.message}`);
    process.exit(1);
  }

  // 기존 데이터가 있으면 초기화 (멱등성)
  // images도 확인: 이전 실행이 products 삽입 전에 실패/롤백하면 products=0이지만
  // images 행이 남아 storage_path unique 제약 위반 발생.
  const { count: existingProductCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });
  const { count: existingImageCount } = await supabase
    .from("images")
    .select("*", { count: "exact", head: true });
  if ((existingProductCount && existingProductCount > 0) || (existingImageCount && existingImageCount > 0)) {
    console.log(`[seed] Existing data found (${existingProductCount ?? 0} products, ${existingImageCount ?? 0} images). Truncating...`);
    for (const table of ["stocks", "option_values", "option_groups", "products", "images"] as const) {
      await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  try {
    // 2. 버킷 생성 (멱등)
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (bucketError && !bucketError.message.includes("already exists")) {
      throw new Error(`Bucket creation failed: ${bucketError.message}`);
    }
    console.log(`[seed] Bucket "${BUCKET}" ready`);

    // 3. 이미지 생성 + 업로드 (멱등)
    const tmpDir = path.join(os.tmpdir(), `ai-cart-seed-${SEED_VALUE}`);
    const images = await generateImages(tmpDir, SEED_VALUE);

    // 썸네일 업로드
    let thumbSkipped = 0;
    const thumbnails = images.filter((img) => img.type === "thumbnail");
    for (let i = 0; i < thumbnails.length; i++) {
      const img = thumbnails[i];
      const { data: existing } = await supabase.storage.from(BUCKET).list(
        img.storagePath.split("/").slice(0, -1).join("/"),
        { search: img.storagePath.split("/").pop() }
      );
      if (existing && existing.length > 0) {
        thumbSkipped++;
      } else {
        const fileBuffer = fs.readFileSync(img.localPath);
        const { error } = await supabase.storage.from(BUCKET).upload(img.storagePath, fileBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });
        if (error) throw new Error(`Upload failed for ${img.storagePath}: ${error.message}`);
      }
      if ((i + 1) % 50 === 0 || i + 1 === thumbnails.length) {
        process.stdout.write(`\r[seed] Uploading thumbnails: ${i + 1}/${thumbnails.length} (skipped: ${thumbSkipped})`);
      }
    }
    console.log(` ✓`);

    // 긴 상세 업로드
    let detailSkipped = 0;
    const details = images.filter((img) => img.type === "detail");
    for (let i = 0; i < details.length; i++) {
      const img = details[i];
      const { data: existing } = await supabase.storage.from(BUCKET).list(
        img.storagePath.split("/").slice(0, -1).join("/"),
        { search: img.storagePath.split("/").pop() }
      );
      if (existing && existing.length > 0) {
        detailSkipped++;
      } else {
        const fileBuffer = fs.readFileSync(img.localPath);
        const { error } = await supabase.storage.from(BUCKET).upload(img.storagePath, fileBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });
        if (error) throw new Error(`Upload failed for ${img.storagePath}: ${error.message}`);
      }
    }
    console.log(`[seed] Uploading details: ${details.length}/${details.length} ✓ (skipped: ${detailSkipped})`);

    // 4. images 테이블 삽입
    const imageRows = images.map((img) => ({
      storage_path: img.storagePath,
      public_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${img.storagePath}`,
      type: img.type,
      size_bytes: fs.statSync(img.localPath).size,
    }));
    const { data: insertedImages, error: imgError } = await supabase
      .from("images")
      .insert(imageRows)
      .select("id, storage_path, type");
    if (imgError) throw new Error(`images insert failed: ${imgError.message}`);
    console.log(`[seed] Inserting images: ${insertedImages!.length} rows ✓`);

    // ID 맵 구성
    const thumbIds = insertedImages!.filter((r) => r.type === "thumbnail").map((r) => r.id as string);
    const detailIds = insertedImages!.filter((r) => r.type === "detail").map((r) => r.id as string);

    // ---------------------------------------------------------------------------
    // 5. products 삽입 (FR-004 분포)
    // ---------------------------------------------------------------------------
    faker.seed(SEED_VALUE); // 재현성을 위해 시드 재설정

    // 상품 타입 결정 헬퍼
    type ProductType = "no-option" | "one-tier" | "two-tier";

    function getProductType(sortOrder: number): ProductType {
      // 앞 100개 고정 배치
      if (sortOrder === 3 || sortOrder === 13) return "no-option";
      if (sortOrder === 4 || sortOrder === 14) return "one-tier";
      if (sortOrder === 5 || sortOrder === 15) return "two-tier";
      if (sortOrder === 1 || sortOrder === 2 || sortOrder === 11 || sortOrder === 12) return "two-tier";
      // 전체 비율: no-option 20%, one-tier 30%, two-tier 50%
      const roll = faker.number.int({ min: 0, max: 99 });
      if (roll < 20) return "no-option";
      if (roll < 50) return "one-tier";
      return "two-tier";
    }

    function getThumbnailId(sortOrder: number): string {
      // sort_order % 200 방식으로 썸네일 순환 배정 (FR-006)
      return thumbIds[(sortOrder - 1) % 200];
    }

    function getDetailId(sortOrder: number): string | null {
      // sort_order 6~20은 긴 상세 고정, 나머지는 15% 확률
      if (sortOrder >= 6 && sortOrder <= 20) {
        return detailIds[(sortOrder - 6) % 15];
      }
      // 15% 확률로 긴 상세 배정
      if (faker.number.int({ min: 0, max: 99 }) < 15) {
        return detailIds[faker.number.int({ min: 0, max: 14 })];
      }
      return null;
    }

    function getProductName(sortOrder: number): string {
      if (sortOrder === 7) return faker.string.alpha(1); // 1자
      if (sortOrder === 8) return faker.string.alpha(100); // 100자
      return faker.commerce.productName().substring(0, 100);
    }

    function getPrice(sortOrder: number): number {
      if (sortOrder === 9) return 1000; // 최저가
      if (sortOrder === 10) return 2_000_000; // 최고가
      return faker.number.int({ min: 1000, max: 2_000_000 });
    }

    function getAttributes() {
      const seasonCount = faker.number.int({ min: 1, max: 2 });
      const seasons = faker.helpers.arrayElements([...SEASONS], seasonCount);
      return {
        season: seasons,
        material: faker.commerce.productMaterial(),
        style: faker.helpers.arrayElement([...STYLES]),
      };
    }

    // 상품 행 빌드 + 타입 맵
    const productTypes: ProductType[] = [];
    const allProducts: {
      name: string;
      price: number;
      category: Category;
      attributes: object;
      thumbnail_image_id: string;
      detail_image_id: string | null;
      sort_order: number;
    }[] = [];

    for (let i = 0; i < TOTAL_PRODUCTS; i++) {
      const sortOrder = i + 1;
      const type = getProductType(sortOrder);
      productTypes.push(type);
      allProducts.push({
        name: getProductName(sortOrder),
        price: getPrice(sortOrder),
        category: faker.helpers.arrayElement([...CATEGORIES]),
        attributes: getAttributes(),
        thumbnail_image_id: getThumbnailId(sortOrder),
        detail_image_id: getDetailId(sortOrder),
        sort_order: sortOrder,
      });
    }

    // 배치 삽입
    const productIdMap: Map<number, string> = new Map(); // sortOrder → uuid
    for (let batchIdx = 0; batchIdx < TOTAL_PRODUCTS / BATCH_SIZE; batchIdx++) {
      const batch = allProducts.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
      const { data, error } = await supabase.from("products").insert(batch).select("id, sort_order");
      if (error) throw new Error(`products batch ${batchIdx + 1} failed: ${error.message}`);
      for (const row of data!) {
        productIdMap.set(row.sort_order as number, row.id as string);
      }
      if ((batchIdx + 1) % 10 === 0 || batchIdx + 1 === TOTAL_PRODUCTS / BATCH_SIZE) {
        process.stdout.write(`\r[seed] Inserting products: ${(batchIdx + 1) * BATCH_SIZE}/${TOTAL_PRODUCTS}`);
      }
    }
    console.log(` rows ✓ (${TOTAL_PRODUCTS / BATCH_SIZE} batches)`);

    // ---------------------------------------------------------------------------
    // 6-8. option_groups, option_values, stocks
    // ---------------------------------------------------------------------------
    type OptionRow = { product_id: string; name: string; display_order: number };
    type OptionValueRow = { group_id: string; value: string; display_order: number };
    type StockRow = { product_id: string; option_value_ids: string[]; quantity: number };

    const COLOR_VALUES = ["빨간색", "파란색", "초록색", "노란색", "흰색", "검은색"];
    const SIZE_VALUES = ["S", "M", "L", "XL", "XXL"];

    let totalGroups = 0;
    let totalValues = 0;
    let totalStocks = 0;

    // 품절 상품 판단 (FR-004)
    function isSoldOut(sortOrder: number): boolean {
      if (sortOrder === 1 || sortOrder === 11) return true;
      // 전체 5% 품절
      return faker.number.int({ min: 0, max: 99 }) < 5;
    }

    function isPartiallySoldOut(sortOrder: number): boolean {
      if (sortOrder === 2 || sortOrder === 12) return true;
      // 옵션 있는 상품의 10%
      return faker.number.int({ min: 0, max: 99 }) < 10;
    }

    faker.seed(SEED_VALUE + 1); // 옵션 생성용 별도 시드 (재현성)

    const groupBatch: OptionRow[] = [];
    const valueBatch: OptionValueRow[] = [];
    const stockBatch: StockRow[] = [];

    // group.id를 미리 알 수 없으므로 순차 처리 (option_values가 group_id 참조)
    // 배치: 1000개 상품 단위로 flush
    async function flushOptionBatches(force = false) {
      if (!force && groupBatch.length < BATCH_SIZE) return;
      if (groupBatch.length === 0) return;

      const { data: groups, error: ge } = await supabase
        .from("option_groups")
        .insert(groupBatch.splice(0))
        .select("id, product_id, display_order");
      if (ge) throw new Error(`option_groups insert failed: ${ge.message}`);
      totalGroups += groups!.length;

      // group_id 매핑: (product_id, display_order) → id
      const groupIdMap = new Map<string, string>();
      for (const g of groups!) {
        groupIdMap.set(`${g.product_id}:${g.display_order}`, g.id as string);
      }

      // valueBatch에 group_id 채우기는 이미 처리됨 (아래 참조)
      if (valueBatch.length > 0) {
        const { error: ve } = await supabase.from("option_values").insert(valueBatch.splice(0));
        if (ve) throw new Error(`option_values insert failed: ${ve.message}`);
        totalValues += valueBatch.length;
      }
    }

    // 단순화: 순차 처리로 group_id → value_id → stock 처리
    // 배치 크기: BATCH_SIZE 단위
    const optionGroupRows: OptionRow[] = [];
    const optionValueRows: { group_key: string; value: string; display_order: number }[] = [];
    const stockRows: StockRow[] = [];

    // 임시 그룹 맵: sortOrder → { groupDisplayOrder → { name, valueNames[] } }
    type GroupSpec = { name: string; values: string[] };

    for (let i = 0; i < TOTAL_PRODUCTS; i++) {
      const sortOrder = i + 1;
      const type = productTypes[i];
      const productId = productIdMap.get(sortOrder)!;
      const soldOut = isSoldOut(sortOrder);
      const partiallySoldOut = !soldOut && type !== "no-option" && isPartiallySoldOut(sortOrder);

      if (type === "no-option") {
        // 옵션 없음: stocks 1건
        stockBatch.push({
          product_id: productId,
          option_value_ids: [],
          quantity: soldOut ? 0 : faker.number.int({ min: 1, max: 100 }),
        });
      } else {
        // 그룹 정의
        let groups: GroupSpec[];
        if (type === "one-tier") {
          const colorCount = sortOrder === 4 || sortOrder === 14 ? 3 : faker.number.int({ min: 2, max: 4 });
          groups = [
            { name: "색상", values: faker.helpers.arrayElements(COLOR_VALUES, colorCount) },
          ];
        } else {
          // two-tier
          const colorCount = sortOrder === 5 || sortOrder === 15 ? 2 : faker.number.int({ min: 2, max: 3 });
          const sizeCount = sortOrder === 5 || sortOrder === 15 ? 3 : faker.number.int({ min: 2, max: 4 });
          groups = [
            { name: "색상", values: faker.helpers.arrayElements(COLOR_VALUES, colorCount) },
            { name: "사이즈", values: faker.helpers.arrayElements(SIZE_VALUES, sizeCount) },
          ];
        }
        optionGroupRows.push(...groups.map((g, idx) => ({
          product_id: productId,
          name: g.name,
          display_order: idx + 1,
        })));

        // stock 조합 계산: group display_order 오름차순 value 배열
        // (그룹 ID는 아직 모르므로 임시 저장 → 별도 패스에서 처리)
        const combinations: string[][] = [[]];
        for (const g of groups) {
          const newCombinations: string[][] = [];
          for (const combo of combinations) {
            for (const v of g.values) {
              newCombinations.push([...combo, v]);
            }
          }
          combinations.splice(0, combinations.length, ...newCombinations);
        }

        // 나중에 처리할 수 있도록 임시 저장
        // (실제 value id는 insert 후 얻음 → 순차 처리 필요)
        // 단순화: groups + values + stocks를 한꺼번에 처리
        void combinations; void soldOut; void partiallySoldOut;
      }
    }

    // ---------------------------------------------------------------------------
    // 단순화된 순차 처리: 배치 단위로 group → value → stock 처리
    // ---------------------------------------------------------------------------
    faker.seed(SEED_VALUE + 1);

    let processedGroups = 0;
    let processedValues = 0;
    let processedStocks = 0;

    for (let batchStart = 0; batchStart < TOTAL_PRODUCTS; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_PRODUCTS);
      const batchGroupRows: { product_id: string; name: string; display_order: number }[] = [];

      // 이 배치의 상품별 그룹 정의 수집
      type ProductGroupSpec = { productId: string; sortOrder: number; groups: GroupSpec[]; soldOut: boolean; partiallySoldOut: boolean; type: ProductType };
      const batchProductSpecs: ProductGroupSpec[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const sortOrder = i + 1;
        const type = productTypes[i];
        const productId = productIdMap.get(sortOrder)!;
        const so = isSoldOut(sortOrder);
        const pso = !so && type !== "no-option" && isPartiallySoldOut(sortOrder);

        if (type === "no-option") {
          batchProductSpecs.push({ productId, sortOrder, groups: [], soldOut: so, partiallySoldOut: false, type });
        } else {
          let groups: GroupSpec[];
          if (type === "one-tier") {
            const colorCount = sortOrder === 4 || sortOrder === 14 ? 3 : faker.number.int({ min: 2, max: 4 });
            groups = [{ name: "색상", values: faker.helpers.arrayElements(COLOR_VALUES, colorCount) }];
          } else {
            const colorCount = sortOrder === 5 || sortOrder === 15 ? 2 : faker.number.int({ min: 2, max: 3 });
            const sizeCount = sortOrder === 5 || sortOrder === 15 ? 3 : faker.number.int({ min: 2, max: 4 });
            groups = [
              { name: "색상", values: faker.helpers.arrayElements(COLOR_VALUES, colorCount) },
              { name: "사이즈", values: faker.helpers.arrayElements(SIZE_VALUES, sizeCount) },
            ];
          }
          batchProductSpecs.push({ productId, sortOrder, groups, soldOut: so, partiallySoldOut: pso, type });
          batchGroupRows.push(...groups.map((g, idx) => ({
            product_id: productId,
            name: g.name,
            display_order: idx + 1,
          })));
        }
      }

      // option_groups 삽입
      let groupIdMap = new Map<string, string>(); // "productId:displayOrder" → groupId
      if (batchGroupRows.length > 0) {
        const { data: insertedGroups, error: ge } = await supabase
          .from("option_groups")
          .insert(batchGroupRows)
          .select("id, product_id, display_order");
        if (ge) throw new Error(`option_groups batch failed: ${ge.message}`);
        for (const g of insertedGroups!) {
          groupIdMap.set(`${g.product_id}:${g.display_order}`, g.id as string);
        }
        processedGroups += insertedGroups!.length;
      }

      // option_values 삽입
      const batchValueRows: { group_id: string; value: string; display_order: number }[] = [];
      type ValueKey = string; // "productId:groupDisplayOrder:valueDisplayOrder"
      const valueIdMap = new Map<ValueKey, string>();

      for (const spec of batchProductSpecs) {
        if (spec.type === "no-option") continue;
        for (let gIdx = 0; gIdx < spec.groups.length; gIdx++) {
          const group = spec.groups[gIdx];
          const groupId = groupIdMap.get(`${spec.productId}:${gIdx + 1}`)!;
          for (let vIdx = 0; vIdx < group.values.length; vIdx++) {
            batchValueRows.push({ group_id: groupId, value: group.values[vIdx], display_order: vIdx + 1 });
          }
        }
      }

      if (batchValueRows.length > 0) {
        const { data: insertedValues, error: ve } = await supabase
          .from("option_values")
          .insert(batchValueRows)
          .select("id, group_id, display_order");
        if (ve) throw new Error(`option_values batch failed: ${ve.message}`);
        // group_id:displayOrder → id
        for (const v of insertedValues!) {
          valueIdMap.set(`${v.group_id}:${v.display_order}`, v.id as string);
        }
        processedValues += insertedValues!.length;
      }

      // stocks 삽입
      const batchStockRows: StockRow[] = [];
      for (const spec of batchProductSpecs) {
        if (spec.type === "no-option") {
          batchStockRows.push({
            product_id: spec.productId,
            option_value_ids: [],
            quantity: spec.soldOut ? 0 : faker.number.int({ min: 1, max: 100 }),
          });
          continue;
        }

        // 조합 생성 (group display_order 오름차순 보장)
        let combinations: string[][] = [[]];
        for (let gIdx = 0; gIdx < spec.groups.length; gIdx++) {
          const group = spec.groups[gIdx];
          const groupId = groupIdMap.get(`${spec.productId}:${gIdx + 1}`)!;
          const newCombinations: string[][] = [];
          for (const combo of combinations) {
            for (let vIdx = 0; vIdx < group.values.length; vIdx++) {
              const valueId = valueIdMap.get(`${groupId}:${vIdx + 1}`)!;
              newCombinations.push([...combo, valueId]);
            }
          }
          combinations = newCombinations;
        }

        // partiallySoldOut: 첫 번째 그룹의 첫 번째 값(valueId)이 포함된 조합을 전부 품절로 처리.
        // cIdx===0만 품절로 하면 isOptionValueSoldOut이 "해당 값 포함 조합이 모두 0"을 요구하므로
        // 같은 값을 가진 다른 조합(예: 색상0+사이즈1)이 재고 있으면 품절 표시가 안 됨.
        const firstGroupId = groupIdMap.get(`${spec.productId}:1`);
        const firstGroupFirstValueId = firstGroupId
          ? valueIdMap.get(`${firstGroupId}:1`)
          : undefined;

        for (let cIdx = 0; cIdx < combinations.length; cIdx++) {
          let quantity: number;
          if (spec.soldOut) {
            quantity = 0;
          } else if (
            spec.partiallySoldOut &&
            firstGroupFirstValueId !== undefined &&
            combinations[cIdx].includes(firstGroupFirstValueId)
          ) {
            // 첫 번째 그룹의 첫 번째 옵션값이 포함된 조합은 모두 품절
            quantity = 0;
          } else {
            quantity = faker.number.int({ min: 1, max: 100 });
          }
          batchStockRows.push({
            product_id: spec.productId,
            option_value_ids: combinations[cIdx],
            quantity,
          });
        }
      }

      if (batchStockRows.length > 0) {
        // stocks를 더 작은 서브배치로 나눠 삽입 (한 배치에 조합이 많을 수 있음)
        const SUB_BATCH = 2_000;
        for (let s = 0; s < batchStockRows.length; s += SUB_BATCH) {
          const sub = batchStockRows.slice(s, s + SUB_BATCH);
          const { error: se } = await supabase.from("stocks").insert(sub);
          if (se) throw new Error(`stocks batch failed: ${se.message}`);
        }
        processedStocks += batchStockRows.length;
      }

      const pct = Math.round((batchEnd / TOTAL_PRODUCTS) * 100);
      process.stdout.write(`\r[seed] Processing options & stocks: ${batchEnd}/${TOTAL_PRODUCTS} products (${pct}%)`);
    }
    console.log(` ✓`);

    console.log(`[seed] Inserting option_groups: ${processedGroups} rows ✓`);
    console.log(`[seed] Inserting option_values: ${processedValues} rows ✓`);
    console.log(`[seed] Inserting stocks: ${processedStocks} rows ✓`);

    // 임시 파일 정리
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log(`[seed] Done in ${formatDuration(Date.now() - startTime)} ✓`);
    process.exit(0);
  } catch (err) {
    console.error(`\n[seed] Error: ${err instanceof Error ? err.message : String(err)}`);
    await rollback();
    process.exit(1);
  }
}

main();
