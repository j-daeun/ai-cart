# Quickstart: 즉시 반응하는 상품 상세

**작성**: 2026-11-27 | **Plan**: [plan.md](plan.md)

기능이 올바르게 작동하는지 확인하는 최소 실행 가이드. 구체적인 테스트 코드는 `tasks.md`와 구현 단계에서 작성한다.

---

## 사전 조건

```bash
# 로컬 Supabase 실행 (시드 완료 상태)
npx supabase start
npm run seed:local   # 100,000개 시드 (한 번만)

# 개발 서버
npm run dev          # http://localhost:3000
```

E2E 테스트는 `npm run test:e2e` (로컬 Supabase 사용).

---

## 검증 시나리오

### S1. 상품 목록 → 상세 이동 (FR-015 / User Story 5 Scenario 1)

```
1. http://localhost:3000/ 접속
2. 목록에서 상품 카드 클릭
3. 확인: 해당 상품의 상세 화면으로 이동
4. 확인: 상품명·가격·대표 이미지가 표시됨
```

### S2. 상세 정보 표시 (FR-001·FR-002 / User Story 3)

```
1. 긴 상세 이미지가 있는 상품 상세 URL 직접 접속
   예: http://localhost:3000/products/{id}
2. 확인: 상품명·가격·대표 이미지 표시
3. 아래로 스크롤
4. 확인: 긴 상세 이미지 표시 (깨지지 않음)

5. 긴 상세 이미지가 없는 상품 상세 URL 접속
6. 확인: 긴 상세 이미지 영역 없음 (빈 영역·깨진 이미지 없음)
```

### S3. 옵션 선택과 버튼 활성화 (FR-008·FR-010 / User Story 2 Scenario 1·4·5)

```
1. 옵션 그룹이 2개 이상인 상품 상세 접속
2. 확인: 구매·장바구니 버튼 비활성화 상태
3. 첫 번째 그룹에서 옵션 선택
4. 확인: 선택한 옵션 시각적으로 표시 (라디오 체크), 버튼 여전히 비활성화
5. 두 번째 그룹에서 옵션 선택
6. 확인: 버튼 활성화
```

### S4. 품절 옵션 처리 (FR-009·FR-020 / User Story 2 Scenario 2·3·7)

```
1. 품절 옵션이 있는 상품 상세 접속 (seed: sort_order=2 등 부분 품절 상품)
2. 확인: 품절 옵션이 "품절" 텍스트와 함께 시각적으로 구분되어 표시
3. 품절 옵션 클릭 시도
4. 확인: 선택되지 않음 (disabled 속성)
```

### S5. 옵션 선택 해제 불가 (FR-008 / User Story 2 Scenario 8)

```
1. 옵션 그룹에서 옵션 선택
2. 같은 옵션을 다시 클릭
3. 확인: 선택이 유지됨 (라디오 버튼 특성)
```

### S6. 키보드 방향키 옵션 이동 (FR-018 / User Story 2 Scenario 6)

```
1. 옵션 그룹이 있는 상품 상세 접속
2. Tab 키로 첫 번째 옵션에 포커스 이동
3. Arrow Right / Arrow Down 키 입력
4. 확인: 같은 그룹 내 다음 옵션으로 이동하고 선택됨
5. 품절 옵션 건너뜀 확인
```

### S7. 옵션 상태 초기화 (FR-022 / User Story 5 Scenario 5 / Edge Case)

```
1. 상품 상세에서 옵션 선택 (한 개 이상)
2. 목록으로 이동 ("목록으로" 링크 또는 뒤로가기)
3. 같은 상세 화면 재진입 (카드 클릭)
4. 확인: 아무 옵션도 선택되지 않은 초기 상태
5. 버튼 비활성화 상태 (옵션이 있는 상품인 경우)

[브라우저 앞으로가기 케이스]
6. 상세에서 옵션 선택
7. 뒤로가기로 목록 이동
8. 앞으로가기로 상세 재진입
9. 확인: 옵션 초기 상태 (selected 없음)
```

### S8. S1 스크롤 복원 회귀 없음 (SC-007)

```
1. 상품 목록에서 아래로 충분히 스크롤 (50번째 상품 위치)
2. 상품 카드 클릭 → 상세 이동
3. 뒤로가기
4. 확인: 50번째 상품이 화면에 보임 (스크롤 위치 복원)
5. 확인: /api/products 추가 요청 없음 (Network 패널)
```

### S9. 404 처리 (FR-004)

```
1. http://localhost:3000/products/invalid-id-123 접속
2. 확인: "상품을 찾을 수 없습니다" 안내 표시
3. 확인: "목록으로" 링크가 / (목록)로 연결됨
```

### S10. 360px 가로 스크롤 없음 (SC-004 / FR-003)

```
1. 브라우저 DevTools → 뷰포트 너비 360px 설정
2. 상품 상세 페이지 접속
3. 확인: 가로 스크롤바 없음
4. 대표 이미지, 옵션 그룹, 버튼 모두 세로로 정상 표시
```

---

## 성능 측정 준비 (SC-001·SC-002·SC-003)

측정은 기준 환경(SAMSUNG 900X3L, 1.8× CPU throttle, Slow 4G)에서 프로덕션 빌드로만 한다.

```bash
# 1. 프로덕션 빌드
npm.cmd run build

# 2. 프로덕션 서버 시작
npm.cmd run start

# 3. 측정 (autopilot 체크포인트 B에서 실행)
npm.cmd run measure -- --url http://localhost:3000 --spec 002-product-detail --page product-detail --scenario option-click --force-prod
```

측정값은 `docs/measurements/002-product-detail.json`에 저장.

---

## 연관 문서

- [data-model.md](data-model.md) — 타입 정의
- [contracts/get-product.md](contracts/get-product.md) — 데이터 접근 계약
- [spec.md](spec.md) — 수용 기준 (Acceptance Scenarios)
