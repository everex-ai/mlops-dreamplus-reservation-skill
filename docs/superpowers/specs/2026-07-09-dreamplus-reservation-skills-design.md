# DreamPlus 회의실 예약 스킬 — 설계 문서

- 작성일: 2026-07-09
- 대상 사이트: `https://gangnam.dreamplus.asia/reservation/meetingroom` (드림플러스 강남)
- 목표: 예약 현황 조회 / 타임바 시각화 / 예약 / 취소를 대화형으로 수행하는 Claude Code 스킬 세트
- 배포: **GitHub 공개 레포로 사내 공유** (Claude Code + claude-in-chrome 확장 사용자용)

---

## 1. 개요 & 요구사항

원 요구사항 5가지:

1. 로그인 안 되어 있으면 로그인하라고 안내
2. 로그인 되어 있으면 토큰을 Chrome에서 자동 추출
3. 예약 현황 검색 (날짜 / 회의실 위치 / 시간)
4. 한 회의실 + 날짜에 대해 예쁜 ASCII 포맷으로 예약/가능 시간 바 표시
5. "~회의 예약해줘" → 예약, 불가 시 **가까운 위치의 빈 회의실** 안내 (+ 취소 기능 포함)

---

## 2. 확정된 기술 모델 (실측 검증 완료)

> 아래는 로그인 세션에서 실제 API를 호출/관찰하여 확인한 내용이다. 예약 생성/취소는 테스트 1건(2H, 12:30–13:00)을 실제로 만들고 즉시 취소하여 페이로드를 확정했다.

### 2.1 인증

- **토큰 위치**: `sessionStorage.meInfo` (JSON) 의 `jwtToken` 필드 — **JS로 읽기 가능**
- **전송**: HTTP 헤더 `Authorization: <jwtToken>` — **`Bearer ` 접두사 없이 raw JWT**
- **만료**: 응답 봉투의 `code === "301"`, `message === "JWT 토큰이 만료되었습니다."`
  - 앱이 내부적으로 `refreshToken`으로 재발급 후 `meInfo.jwtToken`을 갱신해 sessionStorage에 다시 씀
  - 앱이 아무 API 호출(예: 날짜 변경)만 해도 갱신됨
- **미로그인 감지 신호** (아래 중 하나):
  - `/reservation/meetingroom` 접근 시 `/login?redirectUrl=...`으로 리다이렉트
  - `sessionStorage.meInfo` 부재
  - API 응답 `code === "301"`(만료) 또는 401
- 참고: `meInfo`에는 `id`(회원 107858), `name`, `email`, `centerId`(1), `companyName`, `refreshToken` 등도 포함. **개인 식별자는 런타임에 meInfo에서 읽고 코드에 하드코딩하지 않는다.**
- 요청 본문은 평문 JSON (`dataNoEncrypt: true`) — 별도 암호화 불필요.

### 2.2 응답 봉투 공통 형식

```json
{ "apiVersion": "1.0", "result": "true", "code": "200", "message": "", "list": [ ... ] }
```

- 성공: `code === "200"`. 실패 시 `code`/`message`로 사유 전달 (301=만료 등)
- `totalCount`는 전역 카운터라 신뢰하지 말 것. 하루 결과 수는 `list.length` 사용.

### 2.3 엔드포인트

| 기능 | 메서드 · 경로 | 요청 본문 | 응답 |
|---|---|---|---|
| 회의실 목록 | `POST /api2/meetingrooms` | `{"data":{"reservationDate":"YYYY.MM.DD"}}` (또는 `{"data":{}}`) | `list[]` (38개) |
| 예약 현황 | `POST /api2/meetingroom/reservations` | `{"data":{"searchType":"startTime","startTime":"YYYY.MM.DD 00:00:00","endTime":"YYYY.MM.DD 23:59:59","cancelDate":"YYYY.MM.DD 00:00:00"}}` | `list[]` (해당 날짜 전체 방 예약) |
| **예약 생성** | `POST /api2/meetingroom/reservation` | `{"roomCode":208,"startTime":"YYYY.MM.DD HH:mm:ss","endTime":"YYYY.MM.DD HH:mm:ss","title":"..."}` **(flat, data 래핑 없음, 초 포함)** | `{code:"200",result:true}` |
| **예약 취소** | `DELETE /api2/meetingroom/reservation` | `{"id": <reservationId>}` | `{code:"200",result:true}` |
| (미사용) 일별 | `POST /api2/meetingroom/daily` | — | 가용성. 우리는 reservations로 직접 계산하므로 미사용 |

### 2.4 데이터 모델

**회의실 (`/api2/meetingrooms` list item)**

```
{ roomCode:208, roomName:"Meeting Room 2H", floor:2, maxMember:4,
  equipment:"TV, 화이트보드", point:10000, imageUrl:"..." }
```

- `roomCode` = `floor*100 + 순번` (예: 201=2F A, 208=2H, 1101=11F A)
- 존재 층: **2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19** (총 38개 방)
- `point` = **30분당** 차감 포인트 (방마다 10,000 또는 20,000)

**예약 (`/api2/meetingroom/reservations` list item)**

```
{ id:474524, roomCode:208, roomName:"Meeting Room 2H",
  startTime:"2026.07.09 12:30", endTime:"2026.07.09 13:00",  // 분 단위(초 없음)
  title:"...", memberId:107858, memberName:"...", companyName:"...",
  reservationState:531, reservationStateName:"예약 완료", point:-10000 }
```

### 2.5 도메인 규칙

- **운영시간**: 08:00 ~ 21:00, **슬롯 단위 30분** (예약 UI의 시간 선택 목록 기준)
- **포인트**: 예약 완료 시 즉시 차감
- **취소**: **시작 시간 30분 전까지** 가능. 같은 날(익월 예약은 예약 월 내) 취소 시 포인트 환불
- **과거 슬롯**: 예약 UI는 현재 시각 이후 슬롯만 노출 → 예약 시 과거 시간 차단 필요

---

## 3. 아키텍처 (하이브리드)

**결정**: 토큰은 Chrome에서 신선하게 추출, API 호출은 Node 스크립트에서 수행. 기능별로 별도 스킬.

```
dreamplus-res/                         ← GitHub 레포 = Claude Code 플러그인 겸 마켓플레이스
├── README.md                          ← 설치(플러그인 원라이너)·사용법 (사내 공유용)
├── .claude-plugin/
│   ├── plugin.json                    ← 플러그인 매니페스트 (name: dreamplus)
│   └── marketplace.json               ← 마켓플레이스 카탈로그 (everex-dreamplus)
├── lib/                               ← 공유 Node ESM 모듈 (외부 의존성 0, 내장 fetch)
│   ├── time.mjs                       ← 날짜/시간·슬롯(08–21,30분)·CJK 폭·요일
│   ├── api.mjs                        ← 브라우저 fetch의 참조 규격(get/create/cancel, 301 처리)
│   ├── catalog.mjs                    ← 커밋된 회의실 카탈로그 로더
│   ├── board.mjs                      ← normalizeBoard·isFree·resolveRoom·nearestFreeRooms·expand
│   ├── render.mjs                     ← Board→ASCII (timebar/status, shade·color)
│   └── cli.mjs                        ← 인자 파서·stdin 로드·색상 판정
├── bin/                               ← 스킬이 호출하는 CLI (예약 데이터를 stdin으로 받음)
│   ├── status.mjs / timebar.mjs       ← 그리드 / 단일 회의실 (한 조회 스킬이 분기 호출)
│   ├── book.mjs / cancel.mjs          ← 예약(+폴백) / 취소 — @@ACTION@@ emit
│   └── refresh-catalog.mjs            ← 카탈로그 재생성
├── data/rooms.catalog.json            ← 실측 38개 방(정적)
├── docs/skill-runtime.md              ← 스킬 공용 실행 절차·fetch 스니펫
├── test/ (+fixtures/)                 ← 순수 로직 단위 테스트 (실측 픽스처)
└── skills/                            ← 플러그인 스킬 (/dreamplus:<name>)
    ├── status/SKILL.md                ← 조회(현황 그리드 + 단일 타임바 통합)
    ├── book/SKILL.md                  ← 예약
    └── cancel/SKILL.md                ← 취소
```

### 3.1 실행 흐름 (모든 스킬 공통) — **토큰은 브라우저 밖으로 안 나감**

> 구현 확정: 초기엔 "토큰을 Node로 전달(DP_TOKEN)"을 검토했으나, 이 하네스에서 토큰을 셸로
> 옮기는 것이 안전필터/클립보드 제약으로 불안정했다. 대신 **브라우저가 네트워크(토큰 보유),
> Node는 순수 렌더/판단**으로 정리했다. 상세 절차는 `docs/skill-runtime.md`.

1. **프리플라이트** — claude-in-chrome으로 드림플러스 탭 확보. in-page JS로 `sessionStorage.meInfo`
   확인 → 없거나 `/login`이면 **"Chrome에서 드림플러스에 로그인해 주세요"** 안내 후 중단(요구사항 1). `myId` 확보.
2. **읽기** — 브라우저가 `meInfo.jwtToken`으로 예약을 in-page fetch(요구사항 2) → **민감정보 제거한
   데이터만** 반환. 그리드는 컴팩트 `[[roomCode,'HH:mm','HH:mm']]`(층 스코프면 컨텍스트에 들어감),
   단일 방/내 예약은 전체 객체(작음). `code==="301"`이면 탭 새로고침(앱 자동 재발급) 후 1회 재시도.
3. **렌더/판단** — 데이터를 `bin/*.mjs`에 stdin으로 파이프. Node는 토큰·네트워크 없음.
4. **쓰기(book/cancel)** — Node가 `@@ACTION@@` payload를 emit → **사용자 확인 후** 브라우저에서
   POST(create)/DELETE(cancel) in-page 실행.

### 3.2 핵심 데이터 구조: `Board` (단일 소스)

fetch/정규화를 **한 곳**에 모으고, 모든 뷰·동작은 이 `Board`의 순수 함수로 만든다. (timebar = status를 방 1개로 필터한 것)

```js
// buildBoard(token, date) → Board
{
  date: "2026.07.09",
  rooms: [
    { roomCode:208, name:"Meeting Room 2H", floor:2, cap:4, equipment:"TV, 화이트보드", point:10000,
      busy: [ { start:"12:30", end:"13:00", title:"...", mine:false } ],  // 예약 구간
      free: [ { start:"08:00", end:"12:30" }, { start:"13:00", end:"21:00" } ] } // 가능 구간
    // ... 38개
  ]
}
```

### 3.3 lib 모듈 인터페이스 (초안)

- `time.mjs`: `dayRange(date)`, `toApiDateTime(date,"HH:mm")`, `SLOTS`(08:00~20:30, 26개), `slotIndex(hhmm)`, `dispWidth(str)`(CJK=2)
- `api.mjs`: `getRooms(token,date)`, `getReservations(token,date)`, `createReservation(token,{roomCode,start,end,title})`, `cancelReservation(token,id)` — 봉투 검사, `code==="301"`→`TokenExpiredError`
- `board.mjs`: **`buildBoard(token, date)`** (getRooms+getReservations→정규화), `roomsFrom(board,filters)`, `isFree(board, roomCode, start, end)`, `nearestFreeRooms(board, target, {start,end,minCap})`(같은 층 우선→`|floorΔ|` 최소순), `resolveRoom(board, query)`(이름/코드/"2H"/"2층 A")
- `render.mjs`: **`renderTimebar(board, roomCode)`** (View A), **`renderStatus(board, filters)`** (View B) — 둘 다 Board만 소비하는 순수 함수, `render.mjs`는 fetch를 모른다

> 이점: 슬롯 계산·바 렌더 로직이 단일 소스. 뷰 추가 = Board 새 소비자(데이터 배선 X). 테스트 = Board 픽스처 주입만으로 렌더/동작 검증.

---

## 4. 스킬별 동작

### dreamplus-status — 예약 현황 조회 (요구사항 3)
- 트리거: "내일 오후 비어있는 회의실", "7층 예약현황", "6인실 3시 가능?"
- 입력 파싱: 날짜(기본 오늘), 층 필터, 시간대 필터, 정원 필터
- `getRooms` + `getReservations(date)` → 필터 적용 → **멀티 그리드(View B)** + 요약 출력

### dreamplus-timebar — 단일 회의실 바 (요구사항 4)
- 트리거: "2H 내일 예약바", "Meeting Room 11A 오늘 타임바"
- `resolveRoom` → 해당 방 예약만 → **단일 바(View A)** + 예약 상세 리스트

### dreamplus-book — 예약 (요구사항 5)
- 트리거: "내일 14시 6인실 예약해줘", "2H 오늘 3시 30분 예약"
- 대상 방/시간 해석 → `isFree` 확인
  - 가능: **실행 전 확인**("2F 2H, 07-09 15:00–15:30, 10,000P 예약할까요?") → `createReservation`
  - 불가: `nearestRooms`(같은 층 → 인접 층, 정원 충족)로 **빈 회의실 후보 제시** → 선택 시 예약
- 과거 시간·운영시간 밖·정원 미달 방어

### dreamplus-cancel — 취소
- 트리거: "그 예약 취소", "2H 3시 예약 취소해줘"
- 내 예약(`memberId === meInfo.id`) 조회 → 대상 특정 → 30분 전 규칙 확인 → **확인 후** `cancelReservation(id)`

---

## 5. 타임바 ASCII 디자인 (확정)

- 26칸 = 08:00~20:30 30분 슬롯. `█`=예약, `░`=가능
- 눈금 라벨은 2시간(4칸)마다: `08  10  12  14  16  18  20` (정확히 26칸 정렬)
- **CJK 폭 주의**: 터미널에서 한글은 2칸 폭 → **바 왼쪽 정렬 영역은 ASCII만(방 코드)**, 한글 메타(정원/포인트/건수)는 **바 오른쪽**에 배치(뒤쪽은 정렬 불필요). `render.mjs`는 표시폭 계산 시 CJK를 2로 센다.
- 피드백 반영: **단일 뷰의 "가능 시간대" 텍스트 줄 제거**(바로 충분), **그리드 눈금은 바 시작 위치에 정렬**

**View A — 단일 회의실** (`dreamplus-timebar`)

```
Meeting Room 2H · 2F · 4인 · 10,000P/30분 · 2026-07-09(목)
08  10  12  14  16  18  20
░░░░░░░░░████░░░░░░░░░░░░░░   █예약 ░가능
· 12:30–13:00  테스트 예약
```

**View B — 멀티 그리드** (`dreamplus-status`) — 방코드(ASCII)만 좌측 고정폭, 한글 메타는 바 오른쪽

```
2026-07-09(목) · 2F
     08  10  12  14  16  18  20
2A   ░░░░████████░░░░████░░░░░░  8인 10k · 예약3
2B   ░░████░░░░░░░░░░░░░░░░░░░░  18인 20k · 예약1
2C   ████░░░░░░░░░░░░░░░░░░░░░░  6인 10k · 예약1
2D   ░░░░░░░░░░░░░░░░░░░░░░░░░░  6인 10k · 종일가능
```

---

## 6. 에러 처리

- **미로그인**: 명확한 안내 후 중단 (자격증명 대신 입력 금지)
- **토큰 만료(301)**: 탭 리로드→재추출→1회 재시도. 계속 실패 시 재로그인 안내
- **예약 실패**: `code`/`message` 표면화. 이미 찬 시간 → status로 대안 유도
- **취소 실패**: 30분 규칙 위반/타인 예약 등 사유 안내
- **쓰기 작업(예약·취소)**: 항상 실행 전 확인. 예약은 포인트 차감 명시

---

## 7. 테스트

- 순수 로직(time/rooms/availability/render)은 **캡처한 실제 응답 픽스처**로 단위 테스트
- api.mjs는 fetch 목으로 봉투/301 처리 테스트
- 조회·타임바는 읽기 전용 → 라이브 스모크 안전
- 예약·취소는 dry-run 우선 + 같은 날 슬롯으로 1회 확인 테스트(자동 취소)

---

## 8. 공유(GitHub) 고려사항

- README에 전제조건 명시: Claude Code, **claude-in-chrome 확장**, Chrome에서 드림플러스 로그인
- 개인정보/토큰 하드코딩 금지 — 전부 런타임 meInfo에서
- 외부 의존성 0(내장 fetch) → clone 후 바로 동작
- 스킬은 `.claude/skills/`에 포함(레포 clone 시 프로젝트 스코프로 인식) + `~/.claude/skills`로 복사하는 설치 안내

---

## 9. 미해결/구현 시 확정할 항목

- 토큰 리프레시 전용 엔드포인트(있다면)로 리로드 대신 직접 갱신 — 구현 중 확인
- `dreamplus-book` 다중 슬롯(1시간 이상) 예약: 연속 30분 슬롯 처리 방식
- "가까운 회의실" 층 인접성 가중치(같은 층 > 위아래 1층 > …) 세부 튜닝
- 방 이름 자연어 해석 규칙(정원/층/편의시설 조건 조합) 범위
