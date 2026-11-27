# Quickstart: 상품 목록 무한 스크롤 검증 가이드

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

---

## 전제 조건

1. **로컬 Supabase 실행**: `supabase start`
2. **시드 데이터 적재** (최초 1회): `npm run seed:local`
3. **환경 변수**: `.env.test.local` (로컬 Supabase URL·ANON KEY·SERVICE ROLE KEY)

---

## 실행 명령

```bash
# 타입 검사
npx tsc --noEmit

# 단위 테스트
npm run test

# E2E (로컬 Supabase 사용, 개발 서버 자동 시작)
npm run test:e2e

# 특정 E2E 테스트만
npm run test:e2e -- --grep "product-list"

# 프로덕션 빌드 (성능 측정용)
npm.cmd run build && npm.cmd run start
```

---

## 성공 기준 검증 시나리오

### SC-001 — 렌더링 카드 수 (E2E 인수 조건)

```bash
npm run test:e2e -- --grep "SC-001"
```

- 1,000개·5,000개 스크롤 시점에서 `[data-testid="product-card"]` 개수를 확인
- 기대: 각 시점에서 카드 수 ≤ 뷰포트에 보이는 카드 수 × 3
- Playwright에서 DevTools CDP로 DOM 카드 수 측정 → 가상화 창이 올바르게 동작하는지 확인

### SC-002 — 스크롤 위치 복원 (E2E)

```bash
npm run test:e2e -- --grep "SC-002"
```

- 50번째 카드 클릭 → 상세 → 뒤로가기
- 기대 (통과/실패): 50번째 카드 면적의 50% 이상이 뷰포트 안
- 기대 (통과/실패): `/api/products` 네트워크 재요청 0건
- 기록 (측정): 상세 진입 직전 scrollY와 뒤로가기 직후 scrollY 차이(px) — K1 "위치 오차"

### SC-003 — 첫 화면 HTML (SSR)

```bash
npm run test:e2e -- --grep "SC-003"
# 또는 직접 확인
curl -s http://localhost:3000/ | grep -o 'data-testid="product-card"' | wc -l
```

- 기대: HTML 소스에 첫 번째 상품 이름·가격 포함 (JS 없이도 보임)

### SC-004 — 성능 목표 (기준 환경, prod 빌드)

```bash
npm.cmd run measure -- --url http://localhost:3000 --spec 001-product-list --page product-list --scenario scroll-5000 --force-prod
```

- 기대: LCP ≤ 2.5초, CLS ≤ 0.1 (기준 환경에서 측정, 3회 중앙값)
- 측정 조건: SAMSUNG 900X3L, 충전기 연결, Chrome 1.8× CPU, Slow 4G

### SC-005 — 접근성 (axe-core)

```bash
npm run test:e2e -- --grep "accessibility"
```

- 기대: axe-core 심각(serious)·치명(critical) 등급 위반 0건
- 기대: 키보드만으로 목록 탐색(Tab) · 상세 진입(Enter) 가능

---

## 경계 상황 검증 (E2E route interception)

### 목록 끝

```bash
npm run test:e2e -- --grep "end of list"
```

- `/api/products` 응답을 10개·`hasMore: false`로 가로챔
- 기대: `role="status"` 요소 "상품을 모두 불러왔습니다" 화면에 표시

### 네트워크 오류 · 재시도

```bash
npm run test:e2e -- --grep "error retry"
```

- `/api/products` 두 번째 요청을 abort 처리
- 기대: `role="alert"` 오류 메시지 + "다시 시도" 버튼 표시
- 기대: 이전 상품은 사라지지 않음
- 기대: "다시 시도" 클릭 후 목록 이어 붙음, 중복·누락 없음

### 캐시 만료 (뒤로가기 5분 이후)

```bash
npm run test:e2e -- --grep "cache expiry"
```

- Playwright `page.clock.setFixedTime()`으로 시간을 5분 이상 경과시킴
- 기대: `role="status"` 배너 "시간이 지나 목록을 새로 불러왔어요" 표시
- 기대: "안내 닫기" 버튼 키보드 접근·실행 가능

---

## 아티팩트 연결

| 검증 항목 | 관련 문서 |
| --- | --- |
| API 계약 | [contracts/get-products.md](contracts/get-products.md) |
| 타입 정의 | [data-model.md](data-model.md) |
| 구현 상세 | [research.md](research.md) |
| 인수 조건 | [spec.md](spec.md) §User Scenarios, §Requirements |
