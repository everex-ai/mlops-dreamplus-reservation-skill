# 드림플러스 스킬 런타임 (공용)

모든 dreamplus-* 스킬이 공유하는 실행 절차. Claude가 따라야 할 단계다.
**토큰은 브라우저 안에서만 사용하고 절대 밖으로 추출하지 않는다.** 브라우저는 fetch(네트워크),
Node 스크립트(`bin/*.mjs`)는 순수 렌더/판단만 담당한다.

전제: 이 레포가 작업 디렉토리(프로젝트 루트)이며 `node`(18+)가 있고, claude-in-chrome 확장이 연결돼 있다.
아래에서 `REPO`는 이 레포 루트 경로다.

---

## 1. 프리플라이트 — 로그인 확인 (모든 스킬 공통)

1. claude-in-chrome `tabs_context_mcp`로 탭 확보. 드림플러스 탭이 없으면 생성 후
   `https://gangnam.dreamplus.asia/reservation/meetingroom`로 이동한다.
2. in-page JS로 로그인 상태 + 회원 정보를 확인한다:

```js
// javascript_tool
(() => {
  const me = JSON.parse(sessionStorage.getItem('meInfo') || 'null');
  if (!me || location.pathname.includes('login')) return JSON.stringify({ loggedIn: false });
  return JSON.stringify({ loggedIn: true, myId: me.id, name: me.name });
})()
```

3. `loggedIn=false`면 진행을 멈추고 사용자에게 안내한다:
   > "Chrome에서 드림플러스 강남에 로그인해 주세요. 로그인 후 다시 요청해 주시면 진행하겠습니다."
   (자격증명을 대신 입력하지 않는다.)
4. `myId`를 기억한다(내 예약 구분·`--myid`에 사용).

---

## 2. 예약 데이터 가져오기 (in-page fetch, 스코프별)

토큰은 `meInfo.jwtToken`을 in-page에서 사용한다. 응답 `code`가 `"301"`이면 만료 →
탭을 새로고침(앱이 자동 재발급)한 뒤 1회 재시도한다.

**하루 예약을 컴팩트하게 (status 그리드용, 층 스코프 권장)** — `[[roomCode,'HH:mm','HH:mm'], ...]`:

```js
// javascript_tool — DATE와 FLOOR를 치환. FLOOR 생략 시 전체(단, 크면 층별로 나눠 호출)
(async () => {
  const me = JSON.parse(sessionStorage.getItem('meInfo'));
  const r = await fetch('/api2/meetingroom/reservations', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: me.jwtToken },
    body: JSON.stringify({ data: { searchType: 'startTime',
      startTime: 'DATE 00:00:00', endTime: 'DATE 23:59:59', cancelDate: 'DATE 00:00:00' } }),
  }).then(x => x.json());
  if (r.code === '301') return 'RELOAD';
  const lo = FLOOR * 100, hi = lo + 99; // FLOOR 없으면 lo=0, hi=999999
  return JSON.stringify((r.list || [])
    .filter(x => x.roomCode >= lo && x.roomCode <= hi)
    .map(x => [x.roomCode, x.startTime.slice(11, 16), x.endTime.slice(11, 16)]));
})()
```

**한 회의실 전체 (timebar용)** — 제목 포함 전체 객체(작음):

```js
// ROOMCODE 치환
(async () => {
  const me = JSON.parse(sessionStorage.getItem('meInfo'));
  const r = await fetch('/api2/meetingroom/reservations', { method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json',Authorization:me.jwtToken},
    body: JSON.stringify({data:{searchType:'startTime',startTime:'DATE 00:00:00',endTime:'DATE 23:59:59',cancelDate:'DATE 00:00:00'}})}).then(x=>x.json());
  if (r.code === '301') return 'RELOAD';
  return JSON.stringify((r.list||[]).filter(x=>x.roomCode===ROOMCODE)
    .map(x=>({id:x.id,roomCode:x.roomCode,startTime:x.startTime,endTime:x.endTime,title:x.title,memberId:x.memberId})));
})()
```

**요청 시간대에 겹치는 예약 (book용, 전 회의실)** — 그 시간에 찬 방만이라 작고 **완전**하다
(안 겹치는 방은 전부 비어있음 → 층 무관 정확한 대안 계산). START/END는 'HH:mm':

```js
(async () => {
  const me = JSON.parse(sessionStorage.getItem('meInfo'));
  const r = await fetch('/api2/meetingroom/reservations', { method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json',Authorization:me.jwtToken},
    body: JSON.stringify({data:{searchType:'startTime',startTime:'DATE 00:00:00',endTime:'DATE 23:59:59',cancelDate:'DATE 00:00:00'}})}).then(x=>x.json());
  if (r.code === '301') return 'RELOAD';
  const s = 'START', e = 'END';                 // 'HH:mm'은 사전순=시간순
  return JSON.stringify((r.list||[])
    .filter(x => x.startTime.slice(11,16) < e && s < x.endTime.slice(11,16)) // [s,e) 겹침
    .map(x => [x.roomCode, x.startTime.slice(11,16), x.endTime.slice(11,16)]));
})()
```

**내 예약만 (cancel용)** — `memberId === myId` 필터(작음): "한 회의실 전체"와 같되
`.filter(x => x.memberId === me.id)` 사용.

받은 JSON 문자열을 `bin/*.mjs`에 stdin으로 파이프한다. 예:
`echo '<json>' | node REPO/bin/status.mjs DATE --floor 2 --myid <myId>`

---

## 3. 쓰기 실행 (book/cancel) — 브라우저에서

`bin/book.mjs` / `bin/cancel.mjs`는 판단만 하고 마지막 줄에 `@@ACTION@@`을 출력한다.
**사용자에게 요약(회의실·시간·포인트)을 보여주고 확인을 받은 뒤에만** 아래 in-page fetch를 실행한다.

**예약 생성** (`@@ACTION@@ book {payload}`):

```js
// PAYLOAD = book 액션의 JSON 그대로
(async () => {
  const me = JSON.parse(sessionStorage.getItem('meInfo'));
  const r = await fetch('/api2/meetingroom/reservation', { method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json',Authorization:me.jwtToken},
    body: JSON.stringify(PAYLOAD)}).then(x=>x.json());
  return JSON.stringify({code:r.code, result:r.result, message:r.message});
})()
```

**예약 취소** (`@@ACTION@@ cancel {"id":N}`):

```js
(async () => {
  const me = JSON.parse(sessionStorage.getItem('meInfo'));
  const r = await fetch('/api2/meetingroom/reservation', { method:'DELETE', credentials:'include',
    headers:{'Content-Type':'application/json',Authorization:me.jwtToken},
    body: JSON.stringify({id: ID})}).then(x=>x.json());
  return JSON.stringify({code:r.code, result:r.result, message:r.message});
})()
```

성공은 `code==="200"`. 취소는 시작 30분 전까지만 가능(그 외 API가 사유 반환).
