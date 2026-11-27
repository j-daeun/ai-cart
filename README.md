# AI Cart

AI에게 말하면 원하는 상품을 장바구니까지 담아주는 모바일 커머스 포트폴리오.
1차 배포는 AI 없이, 중저가 폰과 느린 네트워크에서도 결제까지 막힘없이 끝나는 구매 흐름을 먼저 만든다.

## 스펙 진행 현황

| 스펙 | 이름 | 상태 | 브랜치 |
| --- | --- | --- | --- |
| S0 | Foundation | ✅ 완료 | `000-foundation` |
| **S1** | **상품 목록 무한 스크롤** | **⚠️ 구현 완료 (SC-004 LCP 미달)** | `001-product-list` |
| **S2** | **상품 상세** | **⚠️ 구현 완료 (SC-001 TBT 미달)** | `002-product-detail` |
| S3 | 장바구니 | 미착수 | — |
| S4 | 주문·결제 | 미착수 | — |
| S5 | 오픈 트래픽 대응 | 미착수 | — |
| S6 | AI 쇼핑 어시스턴트 | 미착수 | — |
| S7 | 기타 | 미착수 | — |

## 성능 측정 결과

기준 환경: **SAMSUNG 900X3L** · 충전기 연결 · 프로덕션 빌드 · 3회 중앙값.

### S1: 상품 목록

| 지표 | 목표 | 중앙값 | 판정 |
| --- | --- | --- | --- |
| SC-001 렌더링 카드 수 (1,000개 시점) | ≤ 뷰포트 카드 수 × 3 | E2E 통과 | ✅ |
| SC-001 렌더링 카드 수 (5,000개 시점) | ≤ 뷰포트 카드 수 × 3 | E2E 통과 | ✅ |
| SC-002 뒤로가기 위치 복원 | 50번째 카드 50%+ 뷰포트 안, 재요청 0건 | E2E 통과 | ✅ |
| SC-004 LCP | ≤ 2.5초 | **3.973s** (10.02 / 3.695 / 3.973) | ❌ 미달 — SSR fallback 환경 영향 추정 |
| SC-004 CLS | ≤ 0.1 | **0** | ✅ |

### S2: 상품 상세

| 지표 | 목표 | 중앙값 | 판정 |
| --- | --- | --- | --- |
| SC-001 TBT | ≤ 200ms | **556ms** (769 / 523 / 556) | ❌ 미달 — React DOM + Next.js 라우터 ~350kB 파싱 비용 (TanStack은 상세 페이지에 미로드 확인) |
| SC-002 INP | ≤ 200ms | 미측정 | — |
| CLS | ≤ 0.1 | **0** | ✅ |

## 로컬 실행

```bash
# 의존성 설치
npm install

# 개발 서버 (Supabase 로컬 필요)
npm run dev

# E2E 테스트 (dev 서버 실행 중)
npm run test:e2e

# 프로덕션 빌드 및 실행
npm run build
npm run start
```

## 기술 스택

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **State/Data**: TanStack Query v5 (무한 쿼리, staleTime 5분)
- **Virtualization**: TanStack React Virtual v3
- **DB**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Testing**: Playwright (E2E), Vitest (단위)

## 관련 문서

- [PRD](docs/prd.md)
- [설계서](docs/design-decisions.md)
- [ADR S1](docs/adr/001-product-list.md)
- [ADR S2](docs/adr/002-product-detail.md)
- [Constitution](.specify/memory/constitution.md)
