# Implementation Plan: 기반 (Foundation)

**Branch**: `000-foundation` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/000-foundation/spec.md`

## Summary

S0는 S1~S7 전체의 측정·비교 기반을 만드는 작업이다. `@faker-js/faker` 고정 시드로 상품 10만 개를 생성하고, `sharp`로 만든 썸네일 200장·긴 상세 15장을 Supabase Storage에 업로드한다. `lighthouse` npm 패키지를 직접 호출하는 Node.js 측정 스크립트가 기준 환경(CPU 배수·Slow 4G·캐시 비움)에서 3회 측정해 JSON에 누적하고 Markdown을 자동 생성한다. GitHub Actions에 품질 게이트(타입 검사·Vitest·Playwright E2E·서버 키 스캔)를 걸고 Vercel로 배포 연결한다. Next.js App Router 위에 공통 레이아웃(헤더·skip nav·404)을 만들어 모든 기능 화면의 바탕을 완성한다.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20 LTS

**Primary Dependencies**:
- Next.js 15 (App Router)
- `@supabase/supabase-js`, `@supabase/ssr`
- `@faker-js/faker` v9 — 고정 시드 데이터 생성
- `sharp` — 썸네일(800×800 JPEG)·상세 이미지(800×5000 JPEG) 프로그래밍 생성
- `lighthouse` npm 패키지 — Node.js API로 측정 스크립트에서 직접 사용
- `tsx` — TypeScript 스크립트 직접 실행 (cross-platform)
- `Vitest`, `@playwright/test`
- `Tailwind CSS`

**Storage**: Supabase PostgreSQL(원격·로컬 Docker), Supabase Storage(이미지 원본)

**Testing**: Vitest(단위), Playwright(E2E), 로컬 Supabase Docker(E2E DB 환경)

**Target Platform**: Vercel(프로덕션·미리보기), GitHub Actions(CI, ubuntu-latest)

**Project Type**: Web application — Next.js App Router, 단일 저장소

**Performance Goals**: SC-007 — 공통 레이아웃 단독 화면이 Core Web Vitals "좋음" 기준 충족 (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1)

**Constraints**:
- Supabase 무료 플랜: DB ≤ 500MB, Storage ≤ 1GB
- Vercel 무료 플랜
- Windows(개발) + Linux(CI) 양쪽에서 동작 → 셸 스크립트 없이 `tsx` Node.js 스크립트만 사용
- 서비스 키는 클라이언트 번들에 절대 포함 금지

**Scale/Scope**: 상품 100,000개, 썸네일 이미지 200개, 긴 상세 이미지 15개, 재고 레코드 약 410k건

## Constitution Check

| 원칙 | 적용 여부 | 비고 |
|------|-----------|------|
| I. 측정 먼저 | 미적용 | "S0는 사용자 기능이 아니므로 네 단계를 적용하지 않는다" (Constitution I) |
| II. 기준 환경 고정 | ✓ | 측정 스크립트가 CPU 배수·Slow 4G·캐시 비움을 자동 적용; S0 착수 시 Chrome 보정 후 `docs/measurements/config.json`에 기입 |
| III. FE 몫 중심 | ✓ | 서버 작업(Supabase 스키마·시드)은 측정의 전제 조건으로 최소 범위만 |
| IV. 범위 준수 | ✓ | 커서 페이지네이션·옵션 선택·대기열·AI 도구 등 타 스펙 항목 없음 |
| V. 정직한 기록 | ✓ | 측정 기록에 FR-014의 여덟 항목 모두 포함 |
| 품질 게이트 (기본 검사) | ✓ | CI에 타입 검사·Vitest·Playwright E2E 포함 |
| 품질 게이트 (성능 예산) | ✓ | S0에는 예산 미등록이므로 측정 결과만 기록, 차단 없음 |
| 품질 게이트 (보안) | ✓ | CI에서 `.next/static` 내 서비스 키 패턴 스캔 |

**GATE: PASS** — Constitution 위반 없음.

---

*Phase 1 설계 후 재검토*: data-model.md · contracts/ 완성 후 범위 준수 재확인 → 위반 없음.

## Project Structure

### Documentation (this feature)

```text
specs/000-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── seed-cli.md      # Phase 1 output
│   └── measure-cli.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx              # Root Layout — 공통 헤더 · skip nav · <main>
│   ├── page.tsx                # 홈 placeholder (S1에서 상품 목록으로 교체)
│   └── not-found.tsx           # 404 (FR-025)
├── components/
│   └── layout/
│       ├── Header.tsx          # "AI Cart 홈" 링크 + 비활성 장바구니 버튼
│       └── SkipNav.tsx         # "본문으로 건너뛰기" (FR-024)
└── lib/
    └── supabase/
        ├── client.ts           # 브라우저용 (anon key만)
        └── server.ts           # 서버용 (service key, Server Component·API Route 전용)

supabase/
└── migrations/
    └── 20261121000000_initial_schema.sql   # 전체 스키마 + RLS

scripts/
├── seed.ts                     # npm run seed (상품·이미지·옵션·재고 생성)
├── generate-images.ts          # sharp로 이미지 생성 (seed.ts 내부에서 호출)
└── measure.ts                  # npm run measure (Lighthouse 3회 → JSON 누적 → MD 재생성)

docs/
└── measurements/
    ├── config.json             # CPU 배수 · 기기 모델 (S0 착수 시 Chrome 보정 후 기입)
    ├── 000-foundation.json     # 기준 환경 측정 기록 누적
    └── 000-foundation.md       # JSON으로부터 자동 생성

.github/
└── workflows/
    ├── ci.yml                  # PR 품질 게이트 (타입·테스트·E2E·키 스캔)
    └── perf.yml                # Vercel 미리보기 → Lighthouse CI 측정 (결과만 기록)

lighthouserc.json               # Lighthouse CI 설정 (CI 회귀 감지용)
```

**Structure Decision**: Next.js App Router의 `/src/app`을 페이지 루트로 사용한다. 서버 전용 Supabase 클라이언트(`server.ts`)와 브라우저용(`client.ts`)을 파일로 분리해 서비스 키 클라이언트 노출을 구조적으로 차단한다. 스크립트는 `/scripts`에서 `tsx`로 실행해 Windows/Linux 공통 동작을 보장한다.

## Complexity Tracking

> Constitution 위반 없음. 해당 없음.
