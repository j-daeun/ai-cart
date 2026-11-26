---
name: speckit-autopilot
description: 한 스펙(NNN-name)을 Plan부터 최종 검증까지 자동으로 진행한다. 설계서에서 고른 방식으로 바로 구현하고, 검증 실패 시 스스로 고쳐 다시 돌린다. "/speckit-autopilot 001-product-list"처럼 스펙 이름과 함께 실행.
---

# speckit-autopilot

한 스펙을 **Plan → Tasks → Analyze → Implement → 측정 → 기록 → 최종 검증**까지 자동으로 진행한다.
구현은 **설계서(docs/design-decisions.md)에서 고른 최선책으로 바로** 한다. 기준점(baseline) 구현과 개선 단계를 따로 두지 않는다.

## 시작 조건 (하나라도 어긋나면 시작하지 말고 보고)

1. 인자로 스펙 이름을 받았다 (예: `001-product-list`).
2. 현재 브랜치가 스펙 이름과 같다 (`git branch --show-current`). main이면 중단.
3. `.specify/feature.json`의 `feature_directory`가 `specs/<spec>`이다. 다르면 고쳐 쓴다.
4. `specs/<spec>/spec.md`가 있고 Clarify가 끝났다 (`## Clarifications` 섹션 존재, `[NEEDS CLARIFICATION]` 없음).
5. 작업 트리가 깨끗하다 (`git status --porcelain` 결과 없음).

## 전체 흐름

```
Plan → [체크포인트 A: 계획 확인]
→ Tasks
→ Analyze 루프 (최대 3회)
→ Implement 루프 (태스크별 검증·수정·커밋)
→ [체크포인트 B: 측정]
→ 기록 (ADR · README · 측정 결과)
→ 최종 검증 (verification.md)
→ 보고
```

### 1. Plan
- `/speckit-plan` 실행. plan.md의 구현 방식은 **설계서의 선정안**과 일치해야 한다. 설계서와 다르면 설계서를 따른다.
- 비교 대안은 plan.md에 "비교 대안 (나중에, 선택)"으로 한 줄만 적고 구현하지 않는다.
- Clarify에서 "plan에서 정한다"고 남긴 값(예: 작은 상품 수 조건, 안내 배너 만료 시간)을 plan.md에 확정해 적는다.

### 체크포인트 A — 계획 확인 (멈춤)
- 사용자에게 다음만 짧게 보고하고 **멈춘다**: 구현 방식 한 줄, 새로 추가할 라이브러리(있으면), plan에서 확정한 값, 측정 시나리오.
- 사용자가 "진행"이라고 하면 이어간다. 라이브러리 추가는 이때 승인받은 것만 쓴다.

### 2. Tasks
- `/speckit-tasks` 실행. 태스크는 다음 순서로 묶는다:
  1. 준비 (타입 · 데이터 접근 · 테스트 골격)
  2. 구현 (선정안 그대로)
  3. 검증 (단위 · E2E · 접근성)
  4. 측정 · 기록
- 결제(S3)는 장애 시나리오 테스트 태스크를 구현 태스크보다 앞에 둔다.

### 3. Analyze 루프 (최대 3회)
- `/speckit-analyze` 실행. CRITICAL / HIGH 이슈가 있으면 spec · plan · tasks를 고치고 다시 실행.
- 3회 후에도 CRITICAL이 남으면 **BLOCKED**로 보고하고 멈춘다.
- 수정이 있었으면 커밋: `[S<n>] Analyze 반영`.

### 4. Implement 루프 (태스크마다)
각 태스크에 대해:
1. 구현한다.
2. 검증 명령을 돌린다 (태스크 성격에 맞는 것, 마지막 태스크는 전부):
   - `npx tsc --noEmit`
   - `npm run test`
   - `npm run build`
   - `npm run test:e2e` (로컬 Supabase 사용)
3. 실패하면 원인을 고치고 다시 돌린다. **같은 태스크에서 최대 3회.**
4. 3회 후에도 실패하면 그 태스크를 미완료로 두고 **BLOCKED** 보고 후 멈춘다.
5. 통과하면 tasks.md에서 체크하고 커밋: `[S<n>] T0xx <한국어 요약>`.

### 체크포인트 B — 측정 (멈춤)
측정은 사용자가 기준 환경(SAMSUNG 900X3L, 충전기 연결, 다른 프로그램 종료)에서 직접 돌린다. 에이전트는 준비만 한다.
- 측정용 커밋에 태그를 단다: `git tag <spec>-measured` (예: `001-product-list-measured`).
- 사용자에게 실행할 명령을 그대로 보여주고 **멈춘다**:
  ```
  npm.cmd run build
  npm.cmd run start
  npm.cmd run measure -- --url http://localhost:3000 --spec <spec> --page <page> --scenario <scenario> --force-prod
  ```
- 사용자가 "측정 끝"이라고 하면 `docs/measurements/<spec>.json`을 읽고 성공 기준과 비교한다.
- 목표 미달이어도 수치를 조작하거나 조건을 바꾸지 않는다. 미달 사실과 원인 추정을 기록하고 계속 진행한다.

### 5. 기록
- `docs/adr/<spec>.md`: 선택한 방식, 이유(설계서 근거), 측정 결과, 비교 대안(나중에, 선택).
- `README.md`: 진행 표와 결과 표의 해당 행을 갱신. 측정하지 않은 칸은 비워둔다.
- 커밋: `[S<n>] 측정 결과 · ADR 기록`.

### 6. 최종 검증
`specs/<spec>/verification.md`에 다음을 표로 적는다:
- spec.md의 수용 기준(Acceptance Scenarios)과 성공 기준(SC-xxx) 하나하나: 통과 / 미달 / 미측정, 근거(테스트 이름 또는 측정 파일).
- 전체 검증 명령 4개의 최종 결과.

모든 수용 기준이 통과해야 **완료**. 하나라도 실패면 완료라고 하지 않는다.
- 커밋: `[S<n>] 최종 검증 기록`.

### 7. 보고
사용자에게 짧게 보고:
- 상태: 완료 / BLOCKED
- 커밋 수, 태그
- 성공 기준 결과 요약 (미달 항목 있으면 이유)
- 다음 할 일: `git push` 후 PR 생성 → Quality Gate 통과 확인 → "Create a merge commit"으로 병합 → `git checkout main` → `git pull origin main`
- 병합은 사용자가 한다. 에이전트는 병합하지 않는다.

## 나중에 대안 비교를 할 때 (선택, 이 스킬 범위 밖)
- 1차 배포 후 시간이 나면 `exp/<NNN>-<대안>` 브랜치를 main에서 따서 대안을 구현하고 같은 조건으로 측정한다.
- 실험 브랜치는 main에 병합하지 않는다. 결과만 ADR에 추가한다.

## 금지된 "꼼수" 수정
검증을 통과시키려고 다음을 하지 않는다:
- 테스트를 지우거나 `skip` / `only` 처리, 기대값을 실제 결과에 맞춰 바꾸기
- `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` 추가
- 타임아웃을 늘려 느린 문제를 가리기
- 측정 조건(CPU 배율, 네트워크, 실행 횟수) 변경
- spec.md의 수용 기준을 완화하기 (필요하면 BLOCKED로 보고)

## 금지된 작업
- main에 직접 커밋 · 병합, `git push --force`
- 원격 DB 건드리기: `--remote`, `supabase db push`, `:local` 없는 `npm run seed` / `seed:verify`
- `.env` 계열 파일 읽기 · 출력, 키 값을 코드 · 로그 · 채팅에 쓰기
- 승인받지 않은 라이브러리 추가

## 로그
진행 중 모든 단계(시작 · 검증 결과 · 재시도 · BLOCKED 사유)를 `specs/<spec>/autopilot-log.md`에 시간순으로 짧게 남긴다. 키 값은 절대 적지 않는다.