# Contract: Seed CLI

**Spec ID**: S0 | **Script**: `scripts/seed.ts`

---

## 사용법

```bash
# 원격 Supabase (배포·측정용) — .env.local의 SUPABASE_URL 사용
npm run seed

# 로컬 Supabase Docker (E2E·CI용) — .env.test.local의 SUPABASE_URL 사용
npm run seed:local
```

---

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 (서버 전용, 클라이언트 코드 금지) | ✓ |
| `SEED_VALUE` | 고정 시드값 (기본: `42`) | 선택 |

---

## 동작 계약

1. **멱등성**: 이미 데이터가 있으면 모든 테이블을 `TRUNCATE CASCADE` 후 재생성. Storage 이미지 파일은 이미 올라가 있으면 업로드를 건너뜀(FR-006).
2. **원자성**: 중간 실패 시 삽입된 모든 행을 `TRUNCATE CASCADE`로 제거하고 Storage 파일도 정리. 처음 상태로 복원(FR-008).
3. **출력**: 진행 상황을 stdout에 출력. 오류는 stderr에 출력 + 종료 코드 `1`.
4. **성공 종료 코드**: `0`.

---

## 실행 순서

```
1. Supabase 연결 확인
2. 버킷 생성 (없으면 생성, 있으면 건너뜀)
3. 이미지 파일 생성 (sharp) → Storage 업로드 (멱등)
4. images 테이블 삽입
5. products 테이블 삽입 (1,000건 배치)
6. option_groups 삽입
7. option_values 삽입
8. stocks 삽입 (1,000건 배치)
9. 완료 메시지 + 소요 시간 출력
```

---

## stdout 출력 예시

```
[seed] Starting seed (value=42)...
[seed] Bucket "product-images" ready
[seed] Uploading thumbnails: 200/200 ✓ (skipped: 0)
[seed] Uploading details: 15/15 ✓ (skipped: 0)
[seed] Inserting images: 215 rows ✓
[seed] Inserting products: 100000 rows ✓ (100 batches)
[seed] Inserting option_groups: 120000 rows ✓
[seed] Inserting option_values: 360000 rows ✓
[seed] Inserting stocks: 410000 rows ✓
[seed] Done in 4m 32s ✓
```

---

## 예상 소요 시간

SC-001 기준: 10분 이내. 예상: 이미지 업로드 ~3분 + DB 삽입 ~2분 = 5분 내외.
