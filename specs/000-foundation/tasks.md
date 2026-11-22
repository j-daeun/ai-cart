# Tasks: 기반 (Foundation)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Branch**: `000-foundation`

> S0는 사용자 기능이 아니므로 Constitution 원칙 I의 네 단계(기준점 → 측정 → 개선 → 재측정)를 적용하지 않는다. 작업은 Phase 단위로 나뉘며, 각 Phase는 독립적으로 검증할 수 있는 결과를 가진다.

## 형식: `[ID] [P?] [Story?] 설명 — 파일 경로`

- **[P]**: 다른 파일, 의존 없음 → 병렬 실행 가능
- **[Story]**: 해당 사용자 스토리 (US1~US5)

---

## Phase 1: 프로젝트 초기 설정

**목적**: Next.js 15 App Router 프로젝트 뼈대와 모든 의존성 설치. 이후 모든 Phase의 전제 조건.

- [X] T001 Create Next.js 15 App Router project with TypeScript strict in repo root (src/ directory structure per plan.md)
- [X] T002 [P] Install primary runtime dependencies: @supabase/supabase-js, @supabase/ssr, @faker-js/faker v9, sharp, lighthouse, tsx in package.json
- [X] T003 [P] Install dev dependencies: vitest, @vitest/coverage-v8, @playwright/test, @axe-core/playwright, tailwindcss, @types/node, dotenv-cli in package.json
  - `@axe-core/playwright`: SC-007 "자동 접근성 검사 심각·치명 위반 0건" 충족을 위한 axe 연동 (C2)
  - `dotenv-cli`: seed:local 등 npm 스크립트에서 .env.test.local을 선택적으로 로드하기 위해 필요 (U1)
- [X] T004 Configure tsconfig.json — strict mode, paths alias (@/* → ./src/*), target ES2022
- [X] T005 Configure npm scripts in package.json — dev, build, start, test, test:e2e, seed, seed:local, seed:verify, seed:verify:local, measure, measure:compare:
  - `"seed": "tsx scripts/seed.ts"` — .env.local의 SUPABASE_URL 사용 (원격)
  - `"seed:local": "dotenv -e .env.test.local -- tsx scripts/seed.ts"` — .env.test.local의 SUPABASE_URL 사용 (로컬 Docker, U1)
  - `"seed:verify": "tsx scripts/seed-verify.ts"` — 원격 DB 검증
  - `"seed:verify:local": "dotenv -e .env.test.local -- tsx scripts/seed-verify.ts"` — 로컬 DB 검증 (U1)
  - `"measure": "tsx scripts/measure.ts"`
  - `"measure:compare": "tsx scripts/measure.ts compare"` — measure.ts 내 compare 서브커맨드 호출
  - `"test:e2e": "playwright test"`
- [X] T006 Create .gitignore — exclude .env*.local, node_modules, .next, supabase/.branches, supabase/.temp
  - docs/measurements/ 는 측정 원본 기록이므로 Git 추적 대상 — gitignore에 포함하지 않음 (Clarify Q3: JSON은 측정 도구만 쓰는 원본, FR-015)
- [X] T007 Create .env.local.example documenting NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY with comments (FR-021)
- [X] T008 [P] Create .env.test.local.example documenting local Docker Supabase vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for local instance)
- [X] T009 Create next.config.ts — images.remotePatterns for Supabase Storage public bucket (product-images), TypeScript strict
- [X] T010 [P] Create tailwind.config.ts and src/app/globals.css — Tailwind base styles, min-width 360px global default

**검증**: `npm install` 성공, `npm run build` 성공 (빈 App Router 프로젝트), `npm run dev`로 localhost:3000 접속 가능

---

## Phase 2: DB 스키마 · Supabase 클라이언트

**목적**: Supabase CLI 초기화, 5개 테이블 스키마와 RLS 정책 마이그레이션 파일 작성, 서버/클라이언트 Supabase 클라이언트 분리. US1·US5의 전제 조건.

- [X] T011 Run `npx supabase init` in repo root — supabase/config.toml 생성 (C1: `npx supabase start`, `npx supabase db reset`, CI supabase/setup-cli Action 모두 config.toml 필요; T012보다 먼저 실행 필수)
- [X] T012 Create supabase/migrations/20261121000000_initial_schema.sql — 5 tables (images, products, option_groups, option_values, stocks), indexes, RLS policies per data-model.md:
  - images: id uuid PK DEFAULT gen_random_uuid(), storage_path text NOT NULL UNIQUE, public_url text NOT NULL, type text NOT NULL CHECK (type IN ('thumbnail','detail')), size_bytes int NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  - products: id uuid PK, name text NOT NULL (1~100자 극단값 포함), price int NOT NULL (1000~2000000), category text NOT NULL CHECK IN ('tops','bottoms','outerwear','shoes','bags','accessories'), attributes jsonb NOT NULL ({season:[], material:string, style:string}), thumbnail_image_id uuid NOT NULL REFERENCES images(id), detail_image_id uuid REFERENCES images(id), sort_order int NOT NULL UNIQUE, created_at timestamptz
  - option_groups: id uuid PK, product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE, name text NOT NULL, display_order int NOT NULL, UNIQUE(product_id, display_order)
  - option_values: id uuid PK, group_id uuid NOT NULL REFERENCES option_groups ON DELETE CASCADE, value text NOT NULL, display_order int NOT NULL, UNIQUE(group_id, display_order)
  - stocks: id uuid PK, product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE, option_value_ids uuid[] NOT NULL DEFAULT '{}', quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0), UNIQUE(product_id, option_value_ids)
  - Indexes: idx_products_sort_order, idx_products_category, idx_products_attributes (GIN), idx_option_groups_product_id, idx_option_values_group_id, idx_stocks_product_id, idx_stocks_option_value_ids (GIN)
  - RLS: ENABLE ROW LEVEL SECURITY + CREATE POLICY "public read" FOR SELECT USING (true) on all 5 tables
- [X] T013 [P] Create src/lib/supabase/client.ts — browser client using createBrowserClient from @supabase/ssr, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY only (FR-021)
- [X] T014 [P] Create src/lib/supabase/server.ts — server-only client using createServerClient from @supabase/ssr with SUPABASE_SERVICE_ROLE_KEY; for Server Components and API Routes only; add comment "서버 전용 — 클라이언트 코드에서 import 금지" (FR-021)
- [X] T015 Create docs/measurements/config.json — { "cpu_slowdown_multiplier": null, "device_model": null, "browser_version_at_first_measurement": null } (Constitution 원칙 II, FR-010)

**검증**: `npx supabase db push`로 원격 DB 마이그레이션 적용, Supabase 대시보드에서 5개 테이블·7개 인덱스·RLS 정책 확인

---

## Phase 3: US1 — 시드 데이터 생성

**Goal**: 고정 시드값(42)으로 100,000개 상품 + 옵션 + 재고 + 이미지 파일을 Supabase에 멱등·원자적으로 생성한다 (FR-001~FR-008).

**Independent Test**: 빈 DB에서 `npm run seed:local` 2회 실행 → `npm run seed:verify:local -- --compare`로 완전 일치 확인.

- [X] T016 [US1] Create scripts/generate-images.ts — sharp로 이미지 파일 생성:
  - 썸네일 200장: 800×800 JPEG 95% 품질, 카테고리별 단색 배경, 파일명 thumbnails/thumb-{000-199}.jpg (3자리 zero-padded)
  - 긴 상세 15장: 800×5000 JPEG 90% 품질, 파일명 details/detail-{00-14}.jpg (2자리 zero-padded)
  - 로컬 임시 디렉토리에 생성 후 경로 배열 반환 (seed.ts 내부에서 호출)
- [X] T017 [US1] Create scripts/seed.ts — main seed script per contracts/seed-cli.md:
  - faker.seed(42), SEED_VALUE env var로 재정의 가능 (FR-002)
  - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY로 service role 클라이언트 연결
  - 버킷 "product-images" 생성: 멱등 (존재하면 건너뜀) (D-007)
  - 이미지 업로드 멱등: list()로 존재 확인 후 건너뜀 (FR-006)
  - images 테이블 삽입 (215행: 썸네일 200 + 긴 상세 15)
  - products 삽입 1000건 배치 (100 배치), FR-004 분포 적용:
    - 앞 100개 고정 배치: sort_order 1·11=전 옵션 품절, 2·12=일부 옵션 품절, 3·13=옵션 없음, 4·14=1단계 옵션(색상 3개), 5·15=2단계 옵션(색상 2×사이즈 3=6조합), 6~20=긴 상세 이미지, 7=상품명 1자, 8=상품명 100자, 9=최저가 1000원, 10=최고가 2000000원
    - 전체 비율: 옵션 없음 20%(20,000), 1단계 옵션 30%(30,000), 2단계 옵션 50%(50,000)
    - 품절 5%(~5,000), 일부 품절 옵션 있는 상품의 10%(~8,000), 긴 상세 이미지 15%(15,000)
    - sort_order %200 방식으로 썸네일 순환 배정 (FR-006: 연속 20개 상품 서로 다른 이미지)
  - option_groups, option_values, stocks 삽입 1000건 배치
  - stocks.option_value_ids: group display_order 오름차순 정렬 보장, UNIQUE(product_id, option_value_ids)
  - 원자성: 오류 시 TRUNCATE images, products, option_groups, option_values, stocks CASCADE로 롤백 (FR-008)
  - stdout 진행 출력 (seed-cli.md 형식), stderr 오류 출력, 종료 코드 0/1
- [X] T018 [US1] Create scripts/seed-verify.ts — 시드 검증 스크립트:
  - `npm run seed:verify`: products 100,000건 카운트 + 모든 상품에 thumbnail_image_id 연결 확인 (SC-001 간접 검증)
  - `--compare` flag: seed 2회 실행 후 products 전체 필드 값·순서 비교 → 100% 일치 확인 (SC-002)

**검증 (SC-001, SC-002)**:
- `npm run seed` 완료 → stdout에 `[seed] Done in X ✓` 출력, 10분 이내 (SC-001)
- `npm run seed:verify` → 100,000건 + 이미지 연결 확인
- `npm run seed:local` 2회 → `npm run seed:verify:local -- --compare` → 100% 일치 (SC-002)

---

## Phase 4: US5 — 공통 레이아웃

**Goal**: 모든 화면이 공유하는 헤더·skip nav·본문 영역. 360px에서 가로 스크롤 없이 표시, 접근성 완비.

**Independent Test**: `npm run build && npm start`, 360px 너비로 접속 → skip nav 동작, AI Cart 홈 링크, 비활성 장바구니 버튼, 존재하지 않는 경로에서 404 화면 확인.

- [X] T019 [US5] Create src/components/layout/SkipNav.tsx — "본문으로 건너뛰기" skip nav:
  - 평소 화면 밖 위치 (sr-only 또는 absolute -top-full), focus 시 화면에 표시
  - href="#main-content"로 이동 (FR-024)
  - accessible name: "본문으로 건너뛰기"
- [X] T020 [US5] Create src/components/layout/Header.tsx — 헤더 컴포넌트:
  - `<a href="/">` AI Cart 홈 링크 — accessible name "AI Cart 홈" (FR-022, FR-024)
  - `<button aria-disabled="true" aria-label="장바구니">` — 시각적으로 흐리게 (opacity-50 또는 동등), onClick={undefined}, 포커스 가능 (FR-022)
  - 클릭해도 아무 동작 없음; 실제 동작·수량 표시는 S3에서 추가
- [X] T021 [US5] Create src/app/layout.tsx — Root Layout:
  - `<SkipNav />`, `<Header />`, `<main id="main-content">`, `{children}`
  - Tailwind: min-w-[360px], 데스크톱에서 max-w-[480px] mx-auto (모바일 레이아웃 가운데 정렬) (FR-023)
  - lang="ko" on <html>
- [X] T022 [US5] Create src/app/page.tsx — 홈 placeholder (텍스트 "상품 목록 준비 중 — S1에서 추가 예정", S1에서 교체)
- [X] T023 [US5] Create src/app/not-found.tsx — 404 화면:
  - 공통 레이아웃(layout.tsx) 안에 렌더링됨
  - 안내 문구 + `<a href="/">` 홈으로 가는 링크 (FR-025)

**검증 (SC-007 선행 조건)**:
- 360px 너비: 가로 스크롤 없음
- Tab 키 첫 포커스 → "본문으로 건너뛰기" 보임 → Enter → #main-content로 이동
- "AI Cart 홈" 링크 클릭 → 홈(/) 이동
- 장바구니 버튼: 포커스 가능, 클릭해도 아무 동작 없음, 흐리게 표시
- `/nonexistent` 접속 → 404 화면 + 홈 링크 확인

---

## Phase 5: US2 — 측정 도구

**Goal**: Constitution 원칙 II 기준 환경(CPU 배수·Slow 4G·캐시 비움)을 자동 적용해 3회 측정하고, JSON 누적 + Markdown 자동 생성 (FR-010~FR-015).

**Independent Test**: `npm run build && npm start` 후 `npm run measure -- --url http://localhost:3000 --spec 000-foundation --page layout --scenario page-load --force-prod` → docs/measurements/000-foundation.json에 세트 1개 추가, FR-014의 8항목 모두 포함 확인.

- [X] T024 [US2] Create scripts/measure.ts — per contracts/measure-cli.md:
  - CLI args 파싱: --url (required), --spec (required), --page, --scenario (default: page-load), --runs (default: 3), --force-prod
  - 사전 조건: docs/measurements/config.json의 cpu_slowdown_multiplier != null; localhost URL + --force-prod 없으면 "Error: Production build required." 출력 후 exit 1 (FR-013)
  - config.json에서 cpu_slowdown_multiplier, device_model, browser_version 읽기
  - Lighthouse Node.js API 호출: 각 회차마다
    - storage reset (캐시 비움)
    - CPU 배수 적용 (throttlingMethod: 'devtools', cpuSlowdownMultiplier)
    - Slow 4G 네트워크 적용 (preset 또는 직접 설정)
    - LCP, CLS, TBT, transferSize(JS) 추출 (FR-010, FR-012)
  - 중앙값 계산 (3회 중 median, FR-011)
  - git rev-parse HEAD로 커밋 해시 추출
  - lighthouse를 사용해 browser_version 추출
  - docs/measurements/<spec>.json append (FR-015): { spec_id, page, scenario, measured_at, commit, url, browser_version, cpu_slowdown_multiplier, network_profile: "Slow 4G", data_scale: "products:100000", cache: "cleared", runs: [...], median: {...} } — 전체 파일 구조: { "sets": [...] }
  - docs/measurements/<spec>.md 재생성 (JSON으로부터 Markdown 비교 표 자동 생성)
  - compare 서브커맨드 (`npm run measure:compare`): --before/--after measured_at 값으로 두 세트 비교 표 출력 (FR-015); lighthouserc.json의 collect.url은 미기입 — perf.yml에서 `lhci collect --url=$PREVIEW_URL`로 주입
  - **결정 메모 (U4)**: INP 등 상호작용 지표(FR-012)는 Lighthouse 단독으로 측정 불가 (실제 사용자 상호작용 필요). --scenario + Playwright 연동은 S1+ 에서 구현 예정. S0에서는 LCP·CLS·TBT·JS bytes(page-load 시나리오)만 추출

**검증 (SC-003, SC-004)**:
- `npm run measure -- ... --force-prod` 2회 실행
- docs/measurements/000-foundation.json: 세트 2개 확인, FR-014의 8항목(spec_id·page·scenario·measured_at·commit·url·browser_version·cpu_slowdown_multiplier·network_profile·data_scale·cache·runs·median) 모두 포함 (SC-004)
- 두 세트 중앙값 차이 ≤ 10% (SC-003); 10% 초과 시 Constitution 원칙 II 허용 오차 개정
- `--force-prod` 없이 실행 → "Error: Production build required." 출력 후 비정상 종료

---

## Phase 6: US4 — 배포 연결

**Goal**: `main` 병합 시 본 배포, PR 시 미리보기 배포 자동 연결. CI 성능 측정은 미리보기 주소 대상 (FR-019~FR-021).

**Independent Test**: 레이아웃 문구 하나 변경 PR → Vercel 미리보기 URL 접속 → `main` 병합 → 본 배포 URL 반영 확인.

- [X] T025 [US4] Configure Vercel project — GitHub 저장소 연결, main 브랜치 → 본 배포, PR 브랜치 → 미리보기 배포 자동 생성 (Vercel 대시보드 설정, FR-019, FR-020)
- [X] T026 [US4] Add Vercel environment variables — Vercel 대시보드에서:
  - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: Preview + Production 환경 모두
  - SUPABASE_SERVICE_ROLE_KEY: Production 환경만 (클라이언트 번들 노출 차단, FR-021)
  - 로컬 .env.local과 .env.test.local은 저장소에 커밋하지 않음

**검증 (SC-006)**:
- PR 생성 → Vercel 미리보기 URL 자동 생성, PR 화면에서 클릭 가능
- 미리보기 URL 접속 → 공통 레이아웃 표시, 시드 데이터 연결 확인
- `git push origin main` → 본 배포 URL에 변경 반영

---

## Phase 7: US3 — CI 품질 게이트

**Goal**: 모든 PR에서 타입 검사·단위 테스트·E2E·axe 접근성·서버 키 스캔 자동 실행. 하나라도 실패하면 병합 차단 (FR-016~FR-018, SC-007).

**Independent Test**: 타입 오류 PR, 실패하는 테스트 PR, 서버 키 노출 PR 세 개를 각각 올려 차단 확인.

- [ ] T027 [US3] Create vitest.config.ts — Vitest 설정: environment jsdom, include src/**/*.test.ts, paths alias 동기화, coverage provider v8
  - **결정 메모 (U2)**: S0에서 단위 테스트 파일을 별도로 추가하지 않는다면 `passWithNoTests: true`를 설정해 CI가 "0 test files"로 실패하지 않게 해야 함. 대안: Phase 7에 최소 단위 테스트 태스크 추가 (예: src/lib/supabase/client.test.ts). 구현 시 선택
- [ ] T028 [P] [US3] Create playwright.config.ts — Playwright 설정: baseURL=http://localhost:3000, testDir=tests/e2e, 로컬 Supabase Docker URL 로드 (.env.test.local), webServer 옵션으로 테스트 전 dev 서버 자동 시작
  - **결정 메모 (U3)**: FR-009 2단계 초기화(시드 존재 확인 + 가변 테이블 비우기) 로직을 `tests/e2e/global-setup.ts`(Playwright globalSetup)로 구현할지 결정 필요. S0에는 가변 테이블이 없으므로 CI의 `npm run seed:local`로 충분하나, S3+ 가변 테이블(cart 등) 추가 시 globalSetup 없이는 FR-009 불충족. 지금 만들어 두면 S3에서 비우기 로직만 추가하면 됨
- [ ] T029 [P] [US3] Create tests/e2e/layout.spec.ts — 공통 레이아웃 E2E + axe 접근성 자동화 (US5 acceptance scenarios + SC-007 커버):
  - 360px viewport: 가로 스크롤 없음 확인
  - Tab 첫 포커스 → "본문으로 건너뛰기" 가시화, Enter → #main-content 포커스
  - "AI Cart 홈" 링크 → href="/" 확인
  - 장바구니 버튼: aria-disabled="true", accessible name "장바구니"
  - /nonexistent → 404 화면 + 홈 링크 확인
  - **axe 접근성 스캔 (C2)**: @axe-core/playwright로 각 페이지(/, /nonexistent) 스캔. `checkA11y()` 위반 중 심각(critical)·치명(serious) 등급 0건 assert (SC-007)
- [ ] T030 [US3] Create .github/workflows/ci.yml — PR 품질 게이트 (ubuntu-latest, Node.js 20 LTS):
  - npm ci → npm run build → tsc --noEmit (타입 검사, FR-016)
  - npm run test (Vitest, FR-016)
  - supabase/setup-cli Action으로 로컬 Supabase 시작, npx supabase db reset
  - 시드 실행: CI에는 `.env.test.local`이 없으므로(gitignore) `npm run seed:local`(dotenv-cli) 직접 호출 불가. 대신 `supabase/setup-cli` Action의 출력 또는 `npx supabase status --output env`에서 service_role key를 추출한 뒤, `SUPABASE_URL=http://localhost:54321` 와 `SUPABASE_SERVICE_ROLE_KEY=<추출값>`을 GitHub Actions `env:` 블록으로 주입하고 `npx tsx scripts/seed.ts` 직접 호출 (U1)
  - npm run test:e2e (Playwright E2E + axe 스캔, FR-009, FR-016, SC-007)
  - grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static/ → 발견 시 exit 1 (FR-018)
  - 실패 시 PR 차단 (병합 차단 규칙은 GitHub 저장소 설정에서 별도 적용)
- [ ] T031 [P] [US3] Create .github/workflows/perf.yml — Vercel 미리보기 배포 완료 후 Lighthouse CI 측정:
  - deployment_status webhook (또는 vercel-action) 으로 미리보기 URL 획득
  - `lhci collect --url=$PREVIEW_URL` 로 URL 주입 후 Lighthouse CI 실행 (FR-020)
  - 결과 기록만, PR 차단 없음 (S0 성능 예산 미등록, FR-017)
- [ ] T032 [P] [US3] Create lighthouserc.json — Lighthouse CI 설정:
  - collect.url: 미기입 (perf.yml에서 `--url=$PREVIEW_URL`로 주입)
  - assert: 없음 (S0 성능 예산 미등록)
  - upload.target: temporary-public-storage

**검증 (SC-005)**:
- PR1: TypeScript 오류 삽입 (반환 타입 불일치 등) → GitHub Actions CI 차단 (빨간 ✗)
- PR2: `expect(1).toBe(2)` Vitest 테스트 추가 → CI 차단
- PR3: 클라이언트 코드에 `process.env.SUPABASE_SERVICE_ROLE_KEY` 삽입 → CI 차단
- 세 PR 모두 차단 확인 후 revert

---

## Phase 8: 최종 검증 · CPU 배수 보정

**목적**: CPU 배수 보정 완료 및 quickstart.md의 모든 성공 기준(SC-001~SC-007) 최종 확인.

- [ ] T033 Update docs/measurements/config.json — Chrome DevTools > Performance > "Calibrate CPU throttle"로 cpu_slowdown_multiplier 측정 후 기입. device_model, browser_version_at_first_measurement 기입 (Constitution 원칙 II; 이 값이 채워진 후에야 npm run measure가 정상 동작)
- [ ] T034 Run baseline measurement and verify SC-007 — `npm run build && npm start`, `npm run measure -- --url http://localhost:3000 --spec 000-foundation --page layout --scenario page-load --force-prod` 2회 실행 → 중앙값 차이 ≤ 10% 확인 (SC-003), Core Web Vitals "좋음" 확인, axe 보고서 심각·치명 위반 0건 확인 (SC-007)

**검증 — 전체 성공 기준 (quickstart.md SC-001~SC-007)**:

| SC | 항목 | 검증 방법 |
|----|------|-----------|
| SC-001 | 시드 10분 이내 완료 | `npm run seed` 소요 시간 |
| SC-002 | 같은 시드 2회 → 100% 동일 | `npm run seed:verify:local -- --compare` |
| SC-003 | 측정 세트 중앙값 차이 ≤ 10% | `npm run measure` 2회 후 비교 |
| SC-004 | 기록에 8항목 모두 포함 | 000-foundation.json 직접 확인 |
| SC-005 | PR 3종 모두 CI 차단 | GitHub Actions ✗ 확인 |
| SC-006 | 미리보기·본 배포 주소 작동 | 브라우저에서 URL 접속 |
| SC-007 | Core Web Vitals 좋음 + 접근성 0건 | `npm run measure` 결과 + T029 axe 보고서 |

---

## 의존 관계 · 실행 순서

```
Phase 1 (Setup)
  └── Phase 2 (DB Schema)
        ├── Phase 3 (US1 Seed)      ─┐
        └── Phase 4 (US5 Layout)    ─┤ 병렬 가능
                                     │
              Phase 4 완료 후 ────────┤
                ├── Phase 5 (US2 Measure)   ─┐ 병렬 가능
                └── Phase 6 (US4 Deploy)    ─┘
                                              │
              Phase 5 + Phase 6 완료 후 ──────┤
                └── Phase 7 (US3 CI)
                      └── Phase 8 (최종 검증)
```

### Phase 내부 병렬 기회

**Phase 1**: T002, T003 (의존성 설치), T010 (Tailwind) 병렬 가능

**Phase 2**: T011 완료 후 → T013 (client.ts), T014 (server.ts) 병렬 가능

**Phase 7**: T028, T029, T031, T032 병렬 가능

---

## 커밋 규칙

메시지 형식: `[S0] T003 시드 생성 스크립트 추가`
브랜치: `000-foundation` → PR → `main` (squash 아닌 일반 merge)
