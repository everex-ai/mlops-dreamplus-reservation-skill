---
name: status
description: 드림플러스 강남 회의실 예약 현황을 조회한다. 회의실을 특정하면 그 방의 하루 타임바를, 아니면 층·시간대·정원으로 비어있는 회의실을 멀티 타임바 그리드로 보여준다. 트리거 예 — "드림플러스 7층 예약현황", "내일 오후 비어있는 회의실", "2H 타임바", "Meeting Room 11A 오늘 언제 비어?", "회의실 현황 보여줘".
---

# 드림플러스 예약 현황 조회

회의실 예약 현황을 ASCII 타임바로 보여준다. **하나의 조회 기능**이며 범위에 따라 뷰가 갈린다:
- **특정 회의실**을 말하면 → 그 방의 하루 타임바(예약 목록 포함) — `timebar.mjs`
- **층/시간대/정원**만 말하면 → 여러 회의실 그리드 — `status.mjs`

> 경로: 이 스킬이 로드될 때 안내되는 base 디렉토리의 **두 단계 상위가 플러그인 루트**다(이하 `REPO`).
> 스크립트=`REPO/bin/*.mjs`, 공통 런타임 절차=`REPO/docs/skill-runtime.md`.

## 절차

1. **프리플라이트** — `REPO/docs/skill-runtime.md`의 로그인 확인. 미로그인이면 안내 후 중단. `myId` 확보.
2. **범위 판단** — 요청에 특정 회의실("2H", "11A", "Meeting Room 2A")이 있으면 **타임바**,
   층/시간대/정원 위주면 **그리드**. 날짜 기본 오늘. 회의실 코드는 `REPO/data/rooms.catalog.json` 참조.

### A. 특정 회의실 타임바
3. `REPO/docs/skill-runtime.md`의 **"한 회의실 전체"** in-page fetch로 해당 roomCode 예약(제목 포함)을 받는다.
4. `echo '<json>' | node REPO/bin/timebar.mjs <회의실> <YYYY.MM.DD> --myid <myId>`
   내 예약은 "(내 예약)", 인접 예약은 `█/▓`로 구분.

### B. 멀티 회의실 그리드
3. `REPO/docs/skill-runtime.md`의 **"하루 예약 컴팩트"** in-page fetch로 해당 층 예약을
   `[[roomCode,'HH:mm','HH:mm'], ...]`로 받는다(전체는 크니 층 스코프 권장). `RELOAD`면 새로고침 후 재시도.
4. `echo '<json>' | node REPO/bin/status.mjs <YYYY.MM.DD> --floor <N> [--cap <N>] [--start HH:mm --end HH:mm] --myid <myId>`
   `--start/--end`를 주면 그 시간대에 빈 회의실만 필터.

5. **결과 전달** — 렌더 결과를 그대로 보여주고 필요시 "종일가능/가장 빈 방"을 한 줄 요약.
