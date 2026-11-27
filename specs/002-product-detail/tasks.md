# Tasks: 즉시 반응하는 상품 상세

**Input**: specs/002-product-detail/ (plan.md · spec.md · research.md · data-model.md · contracts/get-product.md · quickstart.md)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 다른 파일을 다루므로 병렬 실행 가능
- **[Story]**: 연관 사용자 스토리 (US1–US5)

---

## Phase 1: Setup — 타입 & 데이터 접근

**목적**: 모든 User Story가 공유하는 타입과 Supabase 조회 함수를 준비한다.

- [X] T001 `src/types/product.ts`에 ProductDetail · OptionGroup · OptionValue · StockEntry 타입 추가 (data-model.md §Types 참조: detailImageUrl은 `string | null`, optionGroups는 `OptionGroup[]`, stocks는 `StockEntry[]`)
- [X] T002 `src/lib/products/queries.ts`에 `fetchProductDetail(productId: string): Promise<ProductDetail>` 추가 — Supabase `.select()` with `images!thumbnail_image_id(public_url)`, `images!detail_image_id(public_url)`, `option_groups(id, name, display_order, option_values(id, value, display_order))`, `stocks(option_value_ids, quantity)` JOIN; `.eq('id', productId).single()`; data null이면 `notFound()`, error이면 `throw`; OptionValue.isSoldOut: 해당 valueId가 포함된 stocks 행 모두 quantity===0 (contracts/get-product.md 참조)

**Checkpoint**: `fetchProductDetail()` 호출 시 ProductDetail 반환 확인 (로컬 Supabase 필요)

---

## Phase 2: Foundational — 에러·404 경계 & E2E 골격

**목적**: 오류 처리 UI와 E2E 테스트 파일 골격을 준비한다. 이 Phase가 끝나야 User Story 구현을 시작할 수 있다.

- [X] T003 `src/app/products/[id]/not-found.tsx` 생성 — "상품을 찾을 수 없습니다" 안내 + `<a href="/">목록으로</a>` 링크 (FR-004)
- [X] T004 `src/app/products/[id]/error.tsx` 생성 — `'use client'`, props `{ error, reset }`, "상품 정보를 불러오지 못했습니다" 안내 + `<button onClick={reset}>다시 시도</button>` (FR-005)
- [X] T005 [P] `tests/e2e/product-detail.spec.ts` 생성 — imports (`@playwright/test`, `@axe-core/playwright`), 시드 상품 ID 헬퍼 (옵션 2그룹 · 부분 품절 · 전체 품절 · 옵션 없는 상품), 404·에러 route mock 헬퍼

**Checkpoint**: `npx tsc --noEmit` 타입 오류 없음 / E2E 파일 로딩 확인

---

## Phase 3: US3 — 상품 정보와 이미지 확인

**목적**: 상품명·가격·대표 이미지·긴 상세 이미지를 360px 화면에서 가로 스크롤 없이 표시한다. Server Component로 구현해 US1 TBT 아키텍처(정적 콘텐츠는 HTML로 전달)도 함께 확립한다.

**Independent Test**: 360px 뷰포트에서 상세 URL 접속 → 상품명·가격·이미지 표시, 가로 스크롤바 없음 (SC-004)

- [X] T006 [US3] `src/app/products/[id]/page.tsx` 스텁을 Server Component로 교체 — `const { id } = await params`, `fetchProductDetail(id)` 호출, `<h1>` 상품명, `<p>` 가격(원 단위 포맷), `<img src={thumbnailUrl} alt={name}>` 대표 이미지 렌더링 (FR-001)
- [X] T007 [P] [US3] `src/app/products/[id]/page.tsx`에 긴 상세 이미지 조건부 렌더링 추가 — `detailImageUrl`이 존재할 때만 `<img src={detailImageUrl} alt={\`${name} 상세 이미지\`}>` 렌더링; null이면 해당 영역 미표시 (빈 `<div>` 금지) (FR-002)
- [X] T008 [P] [US3] `src/app/products/[id]/page.tsx`에 Tailwind 반응형 레이아웃 적용 — `max-w-full overflow-x-hidden`, 이미지 `w-full h-auto`, 360px 이상 뷰포트에서 가로 스크롤 없도록 모든 컨테이너·이미지 조정 (FR-003)
- [X] T009 [P] [US3] `tests/e2e/product-detail.spec.ts`에 US3 E2E 테스트 추가 — Scenario 1 (상품명·가격·이미지 visible), Scenario 2 (긴 상세 이미지 있는 상품 scroll 후 visible), Scenario 3 (360px viewport `scrollWidth > innerWidth` false), Scenario 4 (대표 이미지 alt 텍스트 포함, axe 검사); 긴 상세 이미지 없는 상품 edge case (이미지 영역 없음)

**Checkpoint**: `npm run build && npm run test:e2e -- --grep "US3"` 통과

---

## Phase 4: US2 + US4 — 옵션 선택 + 구매·장바구니 버튼

**목적**: 각 옵션 그룹에서 선택하면 버튼이 활성화되고, 품절 옵션은 선택 불가 상태로 표시된다. 옵션 상태는 컴포넌트 외부에 보관하지 않는다 (FR-022).

**Independent Test**: 옵션 2그룹 상품에서 각 그룹 선택 → 버튼 활성화 / 품절 옵션 클릭 불가 E2E 확인 (US2 Scenario 1·2·3·5)

- [X] T010 [US2] `src/components/product-detail/ProductDetailInteractive.tsx` 생성 — `'use client'`, props: `{ optionGroups: OptionGroup[], stocks: StockEntry[] }`, `useState<Record<string, string>>({})` for selectedOptions, `<form autoComplete="off">` wrapper (FR-022, spec.md Q3)
- [X] T011 [US2] `ProductDetailInteractive.tsx`에 옵션 그룹 렌더링 추가 — 각 group: `<fieldset><legend>{name}</legend>`, 각 option: `<input type="radio" name={\`group-${groupId}\`} value={valueId} id={\`opt-${valueId}\`} disabled={isSoldOut} checked={selectedOptions[groupId]===valueId} onChange={() => setSelectedOptions(prev => ({...prev, [groupId]: valueId}))} /><label htmlFor={\`opt-${valueId}\`}>{option.value}{isSoldOut ? ' 품절' : ''}</label>` (FR-008·FR-009·FR-018, spec.md Q2)
- [X] T012 [US4] `ProductDetailInteractive.tsx`에 구매·장바구니 버튼 추가 — `isAllSelected=optionGroups.every(g => g.id in selectedOptions)`, `isAllSoldOut=stocks.every(s=>s.quantity===0)`, `isButtonEnabled=!isAllSoldOut&&(optionGroups.length===0||isAllSelected)`; `<button type="button" disabled={!isButtonEnabled} aria-disabled={!isButtonEnabled}>구매하기</button>`, `<button type="button" disabled={!isButtonEnabled} aria-disabled={!isButtonEnabled}>장바구니에 담기</button>`; isAllSoldOut이면 "품절" 안내 문구 표시 (FR-010·FR-011·FR-012·FR-013·FR-014·FR-021)
- [X] T013 [US2] `src/app/products/[id]/page.tsx`에 `<ProductDetailInteractive>` 통합 — `optionGroups={product.optionGroups}` `stocks={product.stocks}` props 전달 (plan.md 서버·클라이언트 경계 설계 참조)
- [X] T014 [P] [US2] `tests/e2e/product-detail.spec.ts`에 US2 옵션 선택 E2E 테스트 추가 — Scenario 1 (옵션 선택 → 시각적 표시), Scenario 2 (품절 옵션 visible + 선택 불가), Scenario 3 (품절 옵션 클릭 → 선택 안 됨), Scenario 4 (일부만 선택 → 버튼 비활성화), Scenario 5 (전체 선택 → 버튼 활성화), Scenario 8 (선택한 옵션 재클릭 → 선택 유지)
- [X] T015 [P] [US2] `tests/e2e/product-detail.spec.ts`에 US2 접근성 E2E 테스트 추가 — Scenario 6 (방향키로 옵션 그룹 내 이동·선택, 품절 옵션 건너뜀), Scenario 7 (품절 옵션 `disabled` 속성 → axe 검사)
- [X] T016 [P] [US4] `tests/e2e/product-detail.spec.ts`에 US4 버튼 E2E 테스트 추가 — Scenario 1 (옵션 미선택 → 버튼 비활성화), Scenario 2 (전체 선택 → 활성화), Scenario 3 (활성화 버튼 클릭 → 의도치 않은 동작 없음), Scenario 4 (전체 품절 → 버튼 비활성화 + 품절 안내), Scenario 5 (`aria-disabled` 스크린리더 인식 axe 검사)

**Checkpoint**: `npm run build && npm run test:e2e -- --grep "US2|US4"` 통과

---

## Phase 5: US5 — 탐색 & 옵션 상태 초기화

**목적**: 목록↔상세 이동과 뒤로가기·앞으로가기 후 옵션 초기화가 올바르게 작동한다. S1 스크롤 복원 회귀가 없다.

**Independent Test**: 목록 → 상세 → 뒤로가기 → 50번째 상품 위치 복원 (SC-007) + 재진입 시 옵션 초기화 (FR-022)

- [X] T017 [US5] `tests/e2e/product-detail.spec.ts`에 US5 탐색 E2E 테스트 추가 — Scenario 1 (목록 카드 클릭 → 상세 이동), Scenario 2 (상세 뒤로가기 → S1 스크롤 위치 복원), Scenario 3 (URL 직접 접근 → 상품 정보 표시), Scenario 4 (키보드 뒤로가기 → S1 포커스 복원)
- [X] T018 [US5] `tests/e2e/product-detail.spec.ts`에 FR-022 옵션 초기화 E2E 테스트 추가 — Scenario 5 (옵션 선택 → 목록 이동 → 같은 상세 재진입(링크 클릭) → 아무것도 선택 안 된 상태); Edge Case (브라우저 앞으로가기 재진입 → 옵션 초기 상태)
- [X] T019 [P] [US5] `tests/e2e/product-list.spec.ts` SC-002 테스트 — S2 구현 후 50번째 상품 위치 복원 테스트가 여전히 통과하는지 확인; 코드 변경 없이 기존 테스트 실행으로 확인 (SC-007 회귀 없음)

**Checkpoint**: `npm run test:e2e -- --grep "US5|FR-022"` 통과 / SC-002 여전히 통과

---

## Phase 6: US1 — 반응 속도 검증 & 접근성

**목적**: Server Component 아키텍처가 올바르게 적용됐는지 확인하고 (US1 TBT 감소), 키보드·스크린리더 접근성을 검증한다 (SC-005).

**Independent Test**: 접근성 axe 심각·치명 위반 0건 / 키보드 목록→상세→옵션→버튼 흐름 완료 (SC-005)

- [X] T020 [US1] `tests/e2e/product-detail.spec.ts`에 US1 E2E 테스트 추가 — Scenario 2 (페이지 로드 직후 옵션 클릭 가능 — Server Component HTML 렌더링 확인); Scenario 3·4 TBT·INP는 Lighthouse 측정으로 검증 (Checkpoint B)
- [X] T021 [P] `tests/e2e/product-detail.spec.ts`에 접근성 종합 테스트 추가 — `AxeBuilder` 상세 페이지 전체 스캔 (SC-005: 심각·치명 0건); 키보드 흐름 테스트 (Tab → 첫 옵션 → Arrow 이동 → Tab → 버튼 → Space/Enter) (FR-018·FR-019·FR-020·FR-021)

**Checkpoint**: `npm run test:e2e -- --grep "US1|SC-005"` 통과

---

## Final Phase: CI 최종 검증 & 측정 준비

- [ ] T022 `specs/002-product-detail/autopilot-log.md` 생성 및 진행 로그 기록
- [ ] T023 최종 CI 검증 — `npx tsc --noEmit` / `npm run test` / `npm run build` / `npm run test:e2e`; 실패 시 원인 수정 후 재실행 (SC-006)
- [ ] T024 측정 완료 후 `.lighthouserc.yml`에 성능 예산 등록 — TBT 예산 = SC-001 중앙값 × 1.1, INP 예산 = SC-002 중앙값 × 1.1 (Constitution B4; Checkpoint B 이후 실행)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 즉시 시작 가능
- **Phase 2 (Foundational)**: Phase 1 완료 후 — T003·T004는 T001 타입 의존, T005는 독립
- **Phase 3 (US3)**: Phase 2 완료 후 — T006은 T002(fetchProductDetail) 의존
- **Phase 4 (US2+US4)**: Phase 3 완료 후 — T010·T011·T012는 T001 타입 의존, T013은 T006 의존
- **Phase 5 (US5)**: Phase 4 완료 후 — 탐색 E2E는 US3·US2 화면이 필요
- **Phase 6 (US1 검증)**: Phase 4 완료 후 — 옵션·버튼이 있어야 axe·키보드 흐름 테스트 가능
- **Final**: 모든 Phase 완료 후

### User Story Dependencies

- **US3**: Phase 1·2 완료 후 독립적으로 시작 가능
- **US2 + US4**: US3 완료 후 (Server Component page.tsx에 Client Component 통합 필요)
- **US5**: US3·US2·US4 완료 후
- **US1 검증**: US3·US2·US4 완료 후

### Parallel Opportunities

- T005 (E2E 골격)는 T003·T004와 병렬 실행 가능
- T007·T008·T009는 T006 완료 후 병렬 실행 가능
- T014·T015·T016은 T010–T013 완료 후 병렬 실행 가능
- T019 (S1 회귀 확인)는 Phase 4 완료 후 T017·T018과 병렬 실행 가능
- T021 (axe 검사)는 T020과 병렬 실행 가능

---

## Parallel Example: Phase 4 (US2+US4)

```bash
# T010–T013 순차 완료 후 테스트 태스크 병렬 시작:
Task A: T014 — US2 옵션 선택 E2E (option selection scenarios)
Task B: T015 — US2 접근성 E2E (keyboard + axe)
Task C: T016 — US4 버튼 E2E (button active/inactive)
```

---

## Implementation Strategy

### MVP First (US3 → US2+US4)

1. Phase 1–2 완료 (타입·데이터 접근·에러 UI)
2. **Phase 3 완료 (US3)**: 상품 정보 표시 → 가장 기본적인 기능 동작 확인
3. **Phase 4 완료 (US2+US4)**: 옵션 선택 + 버튼 → 구매 흐름의 UI 완성
4. 여기서 멈추고 검증: `npm run build && npm run test:e2e`

### Full Implementation

5. Phase 5 완료 (US5): 탐색·초기화
6. Phase 6 완료 (US1): 접근성·성능 아키텍처 확인
7. Final: CI 검증 → Checkpoint B (Lighthouse 측정) → 성능 예산 등록
