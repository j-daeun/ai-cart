# Contract: Measure CLI

**Spec ID**: S0 | **Script**: `scripts/measure.ts`

---

## 사용법

```bash
npm run measure -- \
  --url https://ai-cart.vercel.app \
  --spec 000-foundation \
  --page layout \
  --scenario page-load
```

---

## 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--url` | 측정 대상 URL (필수) | — |
| `--spec` | 스펙 폴더 이름 (필수) | — |
| `--page` | 화면 이름 (기록에 표시) | — |
| `--scenario` | 시나리오 이름 | `page-load` |
| `--runs` | 측정 횟수 | `3` |
| `--force-prod` | localhost URL에서 프로덕션 빌드 여부 강제 인정 | `false` |

---

## 사전 조건

- `docs/measurements/config.json`의 `cpu_slowdown_multiplier`가 null이 아니어야 한다.
- 대상 URL이 `localhost:3000`이고 `--force-prod`가 없으면 오류로 중단(FR-013).
  - 프로덕션 빌드 감지: `.vercel.app`, 설정된 커스텀 도메인, 또는 `--force-prod` 플래그.
- Chrome이 설치되어 있어야 한다.

---

## 동작

1. `config.json`에서 `cpu_slowdown_multiplier` 읽기.
2. Lighthouse를 `--runs`회 실행. 각 회차마다:
   - 캐시 비움(storage reset)
   - CPU 배수 적용
   - Slow 4G 네트워크 적용
   - 측정 실행 → LCP, CLS, TBT, 전송 JS 크기 추출
3. 지표별 중앙값 계산.
4. `docs/measurements/<spec>.json`에 세트 추가(append).
5. `docs/measurements/<spec>.md` 재생성.

---

## `docs/measurements/config.json` 구조

```json
{
  "cpu_slowdown_multiplier": null,
  "device_model": null,
  "browser_version_at_first_measurement": null
}
```

> S0 착수 시 Chrome DevTools > Performance > "Calibrate CPU throttle"로 보정 후 기입. Constitution 원칙 II의 "[S0 착수 시 보정 후 기입]" 항목.

---

## `docs/measurements/<spec>.json` 레코드 구조

```jsonc
{
  "spec_id": "S0",
  "page": "layout",
  "scenario": "page-load",
  "measured_at": "2026-11-21T10:00:00Z",
  "commit": "abc1234",
  "url": "https://ai-cart.vercel.app",
  "browser_version": "Chrome 131.0.0.0",
  "cpu_slowdown_multiplier": 4,
  "network_profile": "Slow 4G",
  "data_scale": "products:100000",
  "cache": "cleared",
  "runs": [
    { "lcp": 1.2, "cls": 0.00, "tbt": 50, "js_bytes": 120000 },
    { "lcp": 1.3, "cls": 0.00, "tbt": 55, "js_bytes": 120000 },
    { "lcp": 1.2, "cls": 0.00, "tbt": 52, "js_bytes": 120000 }
  ],
  "median": {
    "lcp": 1.2,
    "cls": 0.00,
    "tbt": 52,
    "js_bytes": 120000
  }
}
```

**전체 파일 구조**: `{ "sets": [ ...레코드 배열... ] }`

---

## 비교 표 생성

```bash
# 두 측정 세트를 선택해 Markdown 비교 표 재생성
npm run measure:compare -- \
  --spec 000-foundation \
  --before <measured_at 값> \
  --after <measured_at 값>
```

---

## 개발 서버 측정 거부 동작 (FR-013)

```
$ npm run measure -- --url http://localhost:3000 --spec 000-foundation --page layout
Error: Production build required.
  Detected dev server at localhost:3000.
  Run `npm run build && npm start` first, then re-run with --force-prod.
```
