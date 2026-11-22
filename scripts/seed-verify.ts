/**
 * scripts/seed-verify.ts
 * 시드 데이터 검증 스크립트.
 *
 * 사용:
 *   npm run seed:verify                        # 원격: 100,000건 카운트 + 이미지 연결 확인
 *   npm run seed:verify:local                  # 로컬 Docker
 *   npm run seed:verify:local -- --compare     # 두 번째 시드 후 100% 일치 확인 (SC-002)
 *
 * 환경 변수:
 *   SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL) # 필수
 *   SUPABASE_SERVICE_ROLE_KEY                    # 필수
 *
 * --compare 동작:
 *   products 10만 건 전체 + stocks 전체를 sort_order 기준으로 페이지 단위로 읽어 SHA-256 해시 계산.
 *   최초 실행: 해시를 scripts/tmp/seed-signature.txt에 저장.
 *   이후 실행: 저장된 해시와 비교해 일치/불일치 출력 (SC-002).
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// 환경 변수
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPARE_MODE = process.argv.includes("--compare");
const EXPECTED_PRODUCTS = 100_000;
const SIG_FILE = path.join(process.cwd(), "scripts", "tmp", "seed-signature.txt");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[verify] Error: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 기본 검증 (--compare 없이)
// ---------------------------------------------------------------------------
async function verifyBasic(): Promise<boolean> {
  let ok = true;

  // 1. products 100,000건 확인
  const { count: productCount, error: pcErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });
  if (pcErr) {
    console.error(`[verify] ✗ products count failed: ${pcErr.message}`);
    ok = false;
  } else if (productCount !== EXPECTED_PRODUCTS) {
    console.error(`[verify] ✗ products count: expected ${EXPECTED_PRODUCTS}, got ${productCount}`);
    ok = false;
  } else {
    console.log(`[verify] ✓ products count: ${productCount}`);
  }

  // 2. 모든 상품에 thumbnail_image_id 연결 확인
  const { count: missingThumb, error: mtErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .is("thumbnail_image_id", null);
  if (mtErr) {
    console.error(`[verify] ✗ thumbnail check failed: ${mtErr.message}`);
    ok = false;
  } else if (missingThumb && missingThumb > 0) {
    console.error(`[verify] ✗ ${missingThumb} products missing thumbnail_image_id`);
    ok = false;
  } else {
    console.log(`[verify] ✓ all products have thumbnail_image_id`);
  }

  // 3. images 215건 확인
  const { count: imgCount, error: icErr } = await supabase
    .from("images")
    .select("*", { count: "exact", head: true });
  if (icErr) {
    console.error(`[verify] ✗ images count failed: ${icErr.message}`);
    ok = false;
  } else {
    const imgOk = imgCount === 215;
    console.log(`[verify] ${imgOk ? "✓" : "✗"} images count: ${imgCount} (expected 215)`);
    if (!imgOk) ok = false;
  }

  // 4. stocks 건수 확인
  const { count: stockCount, error: scErr } = await supabase
    .from("stocks")
    .select("*", { count: "exact", head: true });
  if (scErr) {
    console.error(`[verify] ✗ stocks count failed: ${scErr.message}`);
    ok = false;
  } else {
    console.log(`[verify] ✓ stocks count: ${stockCount}`);
  }

  return ok;
}

// ---------------------------------------------------------------------------
// 전체 해시 계산 (--compare 모드)
// ---------------------------------------------------------------------------
async function computeFullHash(): Promise<string> {
  const hash = createHash("sha256");
  const productIdToSortOrder = new Map<string, number>();
  let productPages = 0;

  // Phase 1: products 전체 (sort_order 순) → UUID 비의존 필드만 해시
  process.stdout.write("[verify] Hashing products...");
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sort_order, name, price, category, attributes, detail_image_id")
      .order("sort_order", { ascending: true })
      .range(offset, offset + 999);

    if (error) throw new Error(`products fetch failed at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const p of data) {
      productIdToSortOrder.set(p.id as string, p.sort_order as number);
      // UUID 비포함: sort_order, name, price, category, attributes, has_detail_image
      hash.update(
        `P|${p.sort_order}|${p.name}|${p.price}|${p.category}|${JSON.stringify(p.attributes)}|${p.detail_image_id !== null}\n`
      );
    }

    productPages++;
    if ((productPages % 10) === 0 || data.length < 1000) {
      process.stdout.write(`\r[verify] Hashing products... ${offset + data.length}/${EXPECTED_PRODUCTS}`);
    }
    if (data.length < 1000) break;
  }
  console.log(" ✓");

  // Phase 2: stocks 전체 (product_id → sort_order 변환 후 정렬 → 해시)
  // 메모리에 (sortOrder, quantity, optionCount) 튜플 모두 수집 후 정렬
  process.stdout.write("[verify] Fetching stocks...");

  type StockTuple = [number, number, number]; // [productSortOrder, quantity, optionCount]
  const stockTuples: StockTuple[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("stocks")
      .select("product_id, quantity, option_value_ids")
      .order("id", { ascending: true }) // id 순으로 안정적으로 페이지네이션
      .range(offset, offset + 999);

    if (error) throw new Error(`stocks fetch failed at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const s of data) {
      const sortOrder = productIdToSortOrder.get(s.product_id as string) ?? 0;
      const optionCount = Array.isArray(s.option_value_ids) ? s.option_value_ids.length : 0;
      stockTuples.push([sortOrder, s.quantity as number, optionCount]);
    }

    if ((offset / 1000 + 1) % 50 === 0 || data.length < 1000) {
      process.stdout.write(`\r[verify] Fetching stocks... ${stockTuples.length} rows`);
    }
    if (data.length < 1000) break;
  }
  console.log(" ✓");

  // sort_order 기준 정렬 (같은 sort_order 내에서 quantity, optionCount 순)
  process.stdout.write("[verify] Sorting and hashing stocks...");
  stockTuples.sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  );
  for (const [so, qty, cnt] of stockTuples) {
    hash.update(`S|${so}|${qty}|${cnt}\n`);
  }
  console.log(` ✓ (${stockTuples.length} rows)`);

  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// --compare 모드: 해시 계산 → 저장 또는 비교
// ---------------------------------------------------------------------------
async function verifyCompare(): Promise<boolean> {
  console.log("[verify] --compare mode: computing full hash of products + stocks...");
  console.log("[verify] (페이지 단위로 전체 데이터를 읽습니다. 수 분이 소요될 수 있습니다.)");

  const currentHash = await computeFullHash();
  console.log(`[verify] Hash: ${currentHash}`);

  fs.mkdirSync(path.dirname(SIG_FILE), { recursive: true });

  if (fs.existsSync(SIG_FILE)) {
    const previousHash = fs.readFileSync(SIG_FILE, "utf-8").trim();
    if (currentHash === previousHash) {
      console.log("[verify] ✓ Hash matches — seed is deterministic (SC-002)");
      return true;
    } else {
      console.error("[verify] ✗ Hash MISMATCH — seed is NOT deterministic!");
      console.error(`  Previous: ${previousHash}`);
      console.error(`  Current:  ${currentHash}`);
      return false;
    }
  } else {
    fs.writeFileSync(SIG_FILE, currentHash + "\n", "utf-8");
    console.log(`[verify] ✓ Signature saved to ${SIG_FILE}`);
    console.log("[verify] Run seed again and re-run --compare to verify determinism (SC-002)");
    return true;
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  console.log("[verify] Starting verification...");
  const basicOk = await verifyBasic();

  if (COMPARE_MODE) {
    const compareOk = await verifyCompare();
    if (!basicOk || !compareOk) {
      console.error("[verify] ✗ Verification failed.");
      process.exit(1);
    }
  } else if (!basicOk) {
    console.error("[verify] ✗ Verification failed.");
    process.exit(1);
  }

  console.log("[verify] ✓ All checks passed.");
  process.exit(0);
}

main();
