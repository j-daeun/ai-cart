# Quickstart: 기반 (Foundation) — 검증 가이드

**Spec ID**: S0 | **Date**: 2026-11-21

---

## 사전 조건

- Node.js 20 LTS
- Docker Desktop (로컬 Supabase 실행용)
- Supabase CLI (`npm install -g supabase`)
- Chrome (기준 환경 측정용)
- `.env.local` — 원격 Supabase URL + 서비스 키
- `.env.test.local` — 로컬 Docker Supabase URL + 서비스 키

환경 변수 형식:

```
# .env.local (원격, 배포·측정용)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_key>   # 서버·시드 스크립트 전용
```

---

## 1. 의존성 설치

```bash
npm install
```

---

## 2. Supabase 스키마 적용

**원격 DB**:

```bash
npx supabase db push
# supabase/migrations/ 마이그레이션을 원격 DB에 적용
```

**로컬 Docker** (E2E·CI용):

```bash
npx supabase start       # 최초 한 번, Docker 이미지 다운로드 ~1-2분
npx supabase db reset    # 마이그레이션 적용 + DB 초기화
```

---

## 3. 시드 데이터 생성

**원격 (1회만 실행)**:

```bash
npm run seed
# 예상 출력: "[seed] Done in 4m 32s ✓"
```

**로컬 Docker**:

```bash
npm run seed:local
```

**검증 (SC-001, SC-002)**:

```bash
# 100,000개 + 이미지 연결 확인
npm run seed:verify

# 같은 시드값으로 2회 → 결과 동일 확인 (SC-002)
npm run seed:local
npm run seed:local
npm run seed:verify -- --compare
```

---

## 4. 개발 서버 / 프로덕션 빌드

```bash
npm run dev                    # 개발 서버 (측정 불가, FR-013)
npm run build && npm start     # 프로덕션 빌드 (로컬 측정용)
```

---

## 5. 테스트

**단위 테스트**:

```bash
npm run test
```

**E2E (로컬 Supabase 필요)**:

```bash
npx supabase start
npm run test:e2e
```

---

## 6. CPU 배수 보정 (Constitution 원칙 II — S0 착수 시 1회)

1. Chrome 열기 → DevTools (F12) → Performance 탭 → "Calibrate CPU throttle" 버튼 클릭.
2. 보정 결과 배수(예: `4×`)를 기록.
3. `docs/measurements/config.json` 편집:

```json
{
  "cpu_slowdown_multiplier": 4,
  "device_model": "MacBook Pro 14\" M3",
  "browser_version_at_first_measurement": "Chrome 131.0.0.0"
}
```

4. Constitution 원칙 II의 `배수:` 항목도 같은 값으로 업데이트.

---

## 7. 기준 환경 측정 (SC-003, SC-007)

```bash
npm run build && npm start

npm run measure -- \
  --url http://localhost:3000 \
  --spec 000-foundation \
  --page layout \
  --scenario page-load \
  --force-prod
```

**검증**: `docs/measurements/000-foundation.json`에 세트 1개 추가됐는지, `000-foundation.md`가 갱신됐는지 확인. FR-014의 여덟 항목(SC-004)이 JSON 레코드에 모두 있는지 확인.

---

## 8. CI 품질 게이트 검증 (SC-005)

PR을 세 번 올려 각각 차단되는지 확인:

| PR | 의도적 위반 |
|----|------------|
| PR1 | TypeScript 오류 — 함수 반환 타입 불일치 등 |
| PR2 | 실패하는 Vitest 테스트 — `expect(1).toBe(2)` |
| PR3 | 클라이언트 코드에 `process.env.SUPABASE_SERVICE_ROLE_KEY` 삽입 |

세 PR 모두 GitHub Actions CI가 차단(빨간 ✗)되면 성공.

---

## 9. 배포 연결 검증 (SC-006)

```bash
git push origin 000-foundation
```

1. Vercel 대시보드에서 미리보기 URL 확인.
2. PR 열기 → PR 화면에서 미리보기 URL 접속.
3. `git checkout main && git merge 000-foundation && git push origin main`
4. 본 배포 URL에 변경 반영 확인.

---

## 성공 기준 체크리스트

| SC | 항목 | 검증 방법 |
|----|------|-----------|
| SC-001 | 시드 10분 이내 완료 | `npm run seed` 소요 시간 |
| SC-002 | 같은 시드 2회 → 100% 동일 | `npm run seed:verify -- --compare` |
| SC-003 | 측정 2세트 중앙값 차이 ≤ 10% | `npm run measure` 2회 후 비교 |
| SC-004 | 기록에 8항목 모두 포함 | `000-foundation.json` 직접 확인 |
| SC-005 | PR 3종 모두 CI 차단 | GitHub Actions ✗ 확인 |
| SC-006 | 미리보기·본 배포 주소 작동 | 브라우저에서 URL 접속 |
| SC-007 | Core Web Vitals 좋음 + 접근성 0건 | `npm run measure` 결과 + axe 보고서 |
