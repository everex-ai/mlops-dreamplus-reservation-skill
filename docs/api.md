# 드림플러스 API 규격

`lib/auth.mjs` · `lib/api.mjs`가 구현하는 내용의 근거 문서. 웹 번들(`/js/app.js`, `/js/login.js`)
분석과 실제 호출로 확인했다. 스킬은 이 문서를 읽을 필요 없이 `bin/*.mjs`만 실행하면 된다.

베이스: `https://gangnam.dreamplus.asia`

---

## 공통

**응답 봉투**

```json
{ "apiVersion": "1.0", "result": true, "code": "200", "message": "", "list": [...], "data": {...} }
```

- 성공은 `code === "200"`. `"301"`은 **토큰 만료**(HTTP는 200이다).
- `totalCount`는 전역 카운터라 신뢰하지 말 것. 하루 결과 수는 `list.length`를 쓴다.

**필수 헤더**

| 헤더 | 값 | 비고 |
|---|---|---|
| `Content-Type` | `application/json` | |
| `Authorization` | **raw JWT** | `Bearer ` 접두사 **없음**. `/auth/*`에는 불필요 |
| `Referer` | `https://gangnam.dreamplus.asia/...` | **`/api2/*`에 필수** |

> ⚠️ **`Referer`가 없으면 `/api2/*`는 API를 타지 않고 SPA HTML을 404로 돌려준다.**
> 브라우저에서는 자동으로 붙어서 드러나지 않던 조건이라, Node에서 처음 호출할 때 반드시 걸린다.
> `/auth/publickey`와 `/auth/login`은 Referer도 토큰도 없이 호출된다.

**날짜 형식** — `YYYY.MM.DD` (**점 구분**). 대시 `YYYY-MM-DD`를 쓰면 **HTTP 500**이다.
예약 생성/취소의 타임스탬프는 초까지 포함한 `YYYY.MM.DD HH:mm:ss`.

---

## 인증

브라우저 없이 로그인할 수 있다. 프론트가 하는 것과 동일한 절차다.

### 1. 공개키

```
POST /auth/publickey        (본문 없음, 인증 없음)
→ { data: { RSAModulus, RSAExponent, publicKey } }
```

`publicKey`는 **base64로 인코딩된 SPKI DER**(RSA-1024)다. 그대로 `crypto.createPublicKey`에 넣을 수 있다.

### 2. 비밀번호 암호화

프론트는 JSEncrypt로 `setPublicKey(publicKey).encrypt(password)`를 한다. 규격은
**RSA PKCS#1 v1.5 → base64**이며, Node 내장 `crypto.publicEncrypt`로 그대로 재현된다
(외부 의존성 불필요). 1024비트라 암호문은 128바이트 = base64 172자.

### 3. 로그인

```
POST /auth/login            (인증 없음)
{ "email": "...", "password": "<base64 암호문>", "finger_print": "", "decryptRSA": 1, "publicKey": "<위 publicKey>" }
→ { data: { jwtToken, refreshToken, id, name, email, failPasswordCount, ... } }
```

- 본문은 **flat JSON**이다. `/api2/*`처럼 `{"data":{...}}`로 감싸지 않는다
  (프론트가 이 호출에 `dataNoEncrypt: true`를 주기 때문).
- `finger_print`는 프론트가 fingerprintjs2 값(sessionStorage `fingerPrint`)을 보내지만
  **서버가 검증하지 않는다** — 빈 문자열로 로그인이 되는 것을 확인했다.
- `id`가 `memberId`이고, 내 예약을 가려내는 데 쓴다.
- **`failPasswordCount`가 5를 넘으면 계정이 잠긴다.** 로그인 실패 시 절대 자동 재시도하지 말 것.
- `passwodChangeDiffMonth`(오타는 서버 필드 그대로)가 truthy면 웹 UI가 비밀번호 변경을 요구하지만,
  토큰은 정상 발급되고 API도 동작한다.

**토큰 만료 처리** — 발급된 토큰은 표준 JWT가 아니라(헤더가 `eyJ`가 아니다) 만료 시각을
로컬에서 읽을 수 없다. 그래서 캐시된 토큰으로 먼저 호출하고 `code "301"`이 오면
**1회 재로그인 후 재시도**한다(`lib/auth.mjs`의 `withAuth`).

---

## 회의실 · 예약

| 기능 | 메서드 · 경로 | 요청 본문 | 응답 |
|---|---|---|---|
| 회의실 목록 | `POST /api2/meetingrooms` | `{"data":{"reservationDate":"YYYY.MM.DD"}}` | `list[]` (38개) |
| 예약 현황 | `POST /api2/meetingroom/reservations` | `{"data":{"searchType":"startTime","startTime":"YYYY.MM.DD 00:00:00","endTime":"YYYY.MM.DD 23:59:59","cancelDate":"YYYY.MM.DD 00:00:00"}}` | `list[]` (그 날짜 전 회의실) |
| 예약 생성 | `POST /api2/meetingroom/reservation` | `{"roomCode":208,"startTime":"YYYY.MM.DD HH:mm:ss","endTime":"...","title":"..."}` **(flat)** | `{code:"200"}` |
| 예약 취소 | `DELETE /api2/meetingroom/reservation` | `{"id": <예약 id>}` | `{code:"200"}` |

**회의실**

```
{ roomCode:208, roomName:"Meeting Room 2H", floor:2, maxMember:4,
  equipment:"TV, 화이트보드", point:10000 }
```

- `roomCode` = `floor*100 + 순번` (201=2F A, 208=2H, 1101=11F A)
- 존재 층: 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19 — 총 38개
- `point`는 **30분당** 차감 포인트 (10,000 또는 20,000)
- 목록은 사실상 정적이라 `data/rooms.catalog.json`에 커밋해 두고 조인한다.
  구성이 바뀌면 `node bin/refresh-catalog.mjs`로 재생성.

**예약**

```
{ id:474524, roomCode:208, startTime:"2026.07.09 12:30", endTime:"2026.07.09 13:00",
  title:"...", memberId:107858, memberName:"...", reservationState:531, point:-10000 }
```

시각은 **분 단위**(초 없음)로 돌아온다. 생성 요청에는 초를 붙여야 한다.

---

## 도메인 규칙

- **운영시간** 08:00 ~ 21:00, **30분 단위**
- **포인트**는 예약 완료 시 즉시 차감
- **취소**는 시작 **30분 전**까지. 같은 날 취소면 포인트 환불
