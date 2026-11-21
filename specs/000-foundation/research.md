# Research: 기반 (Foundation)

**Spec ID**: S0 | **Date**: 2026-11-21

---

## D-001. 결정론적 데이터 생성 라이브러리

**Decision**: `@faker-js/faker` v9 (`faker.seed(42)`)

**Rationale**: 상품 이름·카테고리·속성 등 다양한 타입의 가짜 데이터를 시드값 하나로 결정론적으로 생성할 수 있다. `faker.seed(n)` 호출 한 번으로 이후 모든 `faker.*` 호출이 고정 순서를 따라 FR-002(같은 시드값 → 동일 결과)를 보장한다. 풍부한 로케일(ko, en)과 카테고리별 단어 세트를 기본 제공해 별도 텍스트 사전 불필요.

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| `seedrandom` + 직접 구현 | 숫자만 생성하므로 이름·카테고리 등 텍스트 데이터를 별도 구현해야 함; 유지 비용 증가 |
| 고정 JSON 파일 | 100k 레코드를 Git에 넣으면 저장소가 비대해짐; 필드 추가(FR-005) 시 전체 재생성 불가 |
| Supabase seed SQL | 마이그레이션과 혼재, 100k INSERT가 느리고 조건부 로직(FR-004 분포) 구현이 불편 |

---

## D-002. 썸네일 이미지 풀 크기 및 생성 방법

**Decision**: `sharp`로 프로그래밍 생성한 800×800 JPEG 200장. `sort_order % 200` 방식으로 상품에 순환 배정.

**Rationale**:
- FR-006 "한 화면 범위 안에서 같은 이미지 반복 금지" → S1 목록의 예상 페이지 크기(≤ 20건) 대비 10배. `sort_order % 200` 배정 시 연속 20개 상품은 항상 서로 다른 이미지를 가진다.
- `sharp`는 libvips 기반으로 Windows/Linux 모두 prebuilt binaries로 설치. 외부 인터넷 의존 없이 결정론적으로 같은 이미지를 재생성할 수 있다.
- 단색 배경(카테고리별 색상) JPEG 95% 품질 → 파일 크기 약 150-300KB. 200장 × 250KB ≈ 50MB, Supabase Storage 1GB 이내.

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| Unsplash/Picsum API URL만 저장 | Clarify에서 Supabase Storage 사용으로 결정(FR-006); 외부 URL은 측정 중 외부 서버 응답에 의존 |
| 실제 상품 이미지 다운로드 | 라이선스 복잡, 재현 불가(URL 변경 가능), Git에 넣을 수 없음 |
| `node-canvas` | Cairo 라이브러리 의존 → CI(ubuntu) 별도 apt 설치 필요, Windows 빌드 복잡 |
| 100장 | 페이지 크기가 20건을 초과할 경우 반복 위험. 여유 있는 200장 채택 |

---

## D-003. 긴 상세 이미지 사양

**Decision**: `sharp`로 생성한 800×5000 JPEG 90% 품질 15장. 각 이미지를 약 1,000개 상품에 연결 → 15,000개 상품(전체 15%).

**Rationale**:
- 최적화하지 않은 원본의 "무게"를 의도적으로 크게 만들어 S2 기준점 측정에 불리한 조건을 만든다. S4에서 최적화 후 개선폭을 보여주는 것이 목적.
- 800×5000 JPEG 90% ≈ 3-5MB. 15장 × 4MB ≈ 60MB.
- 등록 순서 앞 100개 안에 반드시 포함(FR-004) → sort_order 6~20번 상품에 각 이미지 1개씩 고정 배정.

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| 10장 | Assumption "10~20장"의 하한, 충분하나 15장이 더 다양한 화면 경우를 커버 |
| 20장 × 500개 | 더 다양하지만 Storage 비용 증가, 15장으로 충분 |

---

## D-004. 시드 스크립트 대량 삽입 전략

**Decision**: `@supabase/supabase-js` service role 클라이언트 + 배치 1,000건 단위 `insert`. 삽입 순서: 이미지 → 상품 → 옵션 그룹 → 옵션 값 → 재고. 오류 발생 시 역순으로 `TRUNCATE CASCADE` 롤백(FR-008).

**Rationale**:
- Supabase free plan HTTP API는 각 요청이 ~1-2MB 이내에서 안정적으로 동작.
- 상품 100k건: 100 배치 × 1,000건. 재고 ~410k건: 410 배치. 총 약 600 HTTP 요청 → 월 500k 한도 여유.
- 이미지 업로드(215장)는 Storage API 직접 호출. 멱등 처리: `upload` 호출 전 `list()`로 존재 여부 확인 후 건너뜀(FR-006 멱등 조건).
- 롤백: `TRUNCATE images, products, option_groups, option_values, stocks CASCADE` 한 줄.

**SC-001 소요 시간 추정**:
- 이미지 업로드 215장 × ~1초 ≈ 3-4분
- DB 삽입 600 배치 × ~100ms ≈ 60초
- 합계: ~5분 → 10분 기준 여유

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| PostgreSQL direct COPY | Supabase free plan은 direct connection pooler 경유 필요, 복잡도 증가 |
| Supabase Edge Function | 서버 실행이지만 타임아웃 한도(60s) 위반 위험(FR-001); 로컬 실행 흐름 복잡 |
| 10,000건 배치 | 요청 크기 20MB+ → Supabase API 거부 위험 |

---

## D-005. 측정 도구 구현 방식

**Decision**: `lighthouse` npm 패키지 Node.js API + `scripts/measure.ts`(tsx 실행). 3회 측정 후 중앙값 계산, `docs/measurements/*.json` 누적, Markdown 재생성.

**Rationale**:
- Node.js API를 사용하면 CPU 배수·네트워크 프로필·캐시 초기화를 프로그래밍 방식으로 제어 가능. `config.json`에서 CPU 배수를 읽어 자동 적용(FR-010).
- Constitution 원칙 II는 기준 환경 측정(로컬 노트북)과 CI 측정을 의도적으로 분리. 같은 `lhci` 패키지에 혼재하면 원칙 위반 → 별개 스크립트 필요.
- `tsx` 사용으로 TypeScript 그대로 실행, 컴파일 단계 없이 Windows/Linux 양쪽에서 동작.

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| `lhci` CLI만 | LHCI 출력이 우리 JSON 형식과 달라 변환 필요; 기준 환경 측정과 CI 측정 분리 불명확 |
| Playwright + PerformanceObserver | INP·메모리 등 상호작용 지표(S1+ 필요)에 쓰이지만 LCP·CLS·TBT는 Lighthouse가 더 정확. measure.ts에 `--scenario` 옵션으로 Playwright 연동을 나중에 확장 |
| k6 | 부하 테스트 도구. 단일 사용자 Core Web Vitals 측정에 부적합 |

---

## D-006. CI 워크플로우 구성

**Decision**: `ci.yml`(타입 검사·Vitest·로컬 Supabase Docker·Playwright E2E·서버 키 스캔) + `perf.yml`(Vercel 미리보기 → Lighthouse CI 측정, 결과만 기록).

**Rationale**:
- FR-016: 타입 검사·단위 테스트·E2E 모두 PR 차단 조건.
- FR-018: 서버 키 스캔 → `grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static/` 패턴. 클라이언트 번들(.next/static)에 키가 없는지 CI에서 자동 확인.
- 성능 측정(perf.yml)은 Vercel 미리보기 배포 완료 후 별도 실행 → PR을 블록하지 않고 결과만 기록(S0에는 성능 예산 미등록, FR-017).
- GitHub Actions `ubuntu-latest`는 Docker 기본 지원. `supabase/setup-cli` GitHub Action으로 로컬 Supabase 시작.

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| 원격 Supabase에서 E2E | 원격 DB를 E2E가 초기화하면 측정용 시드 데이터 오염(FR-009) |
| Docker Compose 직접 | Supabase 공식 GitHub Action이 더 간단하고 버전 관리됨 |

---

## D-007. 이미지 Storage 버킷 구성

**Decision**: `product-images` 단일 public 버킷. 경로: `thumbnails/thumb-{000-199}.jpg`, `details/detail-{00-14}.jpg`.

**Rationale**:
- S4에서 셀러 업로드 이미지도 같은 버킷 내 `uploads/` prefix로 추가 가능 → FR-005(기존 구조 불변) 준수.
- public 버킷으로 설정해 `getPublicUrl()` 반환값을 `images.public_url`에 저장 → 클라이언트가 서비스 키 없이 이미지에 직접 접근 가능.
- 버킷 생성은 멱등 처리(이미 존재하면 건너뜀).

**Alternatives considered**:

| 대안 | 기각 이유 |
|------|-----------|
| thumbnails / details 별도 버킷 | Supabase free plan 버킷 수 제한은 없지만 S4 통합 시 관리 복잡도 증가 |
| private 버킷 + signed URL | 공개 상품 이미지에 불필요한 복잡도; 서버 경유 필요 |
