---
name: dreamplus-timebar
description: 드림플러스 강남의 특정 회의실 하루 예약/가능 시간을 ASCII 타임바로 보여준다. 트리거 예 — "드림플러스 2H 타임바", "Meeting Room 11A 내일 예약 현황", "2층 A 오늘 언제 비어?", "그 회의실 시간표 보여줘".
---

# 드림플러스 회의실 타임바

한 회의실의 하루 예약/가능 시간을 08:00~21:00 ASCII 바 + 예약 목록으로 보여준다.
공통 절차는 `docs/skill-runtime.md`를 따른다.

## 절차

1. **프리플라이트** — 로그인 확인(미로그인 안내 후 중단).
2. **회의실·날짜 파악** — 사용자가 말한 회의실("2H", "11A", "Meeting Room 2A")과 날짜(기본 오늘).
   회의실 코드는 `data/rooms.catalog.json`에서 이름→roomCode 확인 가능(예: 2H=208).
3. **데이터 가져오기** — `docs/skill-runtime.md`의 "한 회의실 전체" in-page fetch로 해당
   roomCode 예약(제목 포함)을 받는다. `RELOAD`면 새로고침 후 1회 재시도.
4. **렌더**:

   ```bash
   echo '<json>' | node bin/timebar.mjs <회의실> <YYYY.MM.DD> --myid <myId>
   ```

   내 예약은 "(내 예약)"으로 표시된다. 인접 예약은 `█/▓`로 구분(터미널 색은 `--color`).
5. **결과 전달** — 바 + 예약 목록을 보여주고, 빈 시간대를 한 줄 요약해도 좋다.
