# 드림플러스 회의실 예약 스킬 (dreamplus-res)

드림플러스 강남 회의실을 **Claude Code 대화창에서** 조회·예약·취소하는 스킬 모음(플러그인)입니다. `"내일 오후 6인실 예약해줘"`처럼 자연어로 말하면 되고, 예약이 꽉 찼으면 **가까운 층의 빈 회의실**을 안내합니다.

브라우저나 확장 프로그램은 필요 없습니다. Node가 드림플러스 API를 직접 호출합니다.

---

## 📌 메인 담당자

- **이름**: Liam  
- **이메일**: Liam@everex.co.kr

---

## 🛠️ 설치 및 실행 방법

**전제조건**: [Claude Code](https://claude.com/claude-code), Node.js 18+, [드림플러스 강남](https://gangnam.dreamplus.asia) 계정

Claude Code에서 아래를 **각각 따로** 실행합니다(두 줄을 한 번에 붙여넣지 마세요 — 마켓플레이스 소스 입력창에 두 명령이 합쳐져 실패합니다).

**1 마켓플레이스 추가**

```
/plugin marketplace add everex-ai/mlops-dreamplus-reservation-skill
```

**2 플러그인 설치**

```
/plugin install dreamplus@everex-dreamplus
```

**3 계정 정보 등록** — ⚠️ Claude 대화창이 아니라 **본인 터미널에서** 실행하세요. 대화창에 입력하면 비밀번호가 대화 기록에 남습니다.

```
mkdir -p ~/.dreamplus && chmod 700 ~/.dreamplus
touch ~/.dreamplus/credentials && chmod 600 ~/.dreamplus/credentials
$EDITOR ~/.dreamplus/credentials
```

```json
{
  "email": "you@everex.co.kr",
  "password": "드림플러스 비밀번호"
}
```

등록이 끝나면 Claude Code에서 `"드림플러스 오늘 예약현황"`이라고 물어보세요. 계정 정보에 문제가 있으면 스킬이 무엇을 고쳐야 하는지 알려줍니다.


---

## ✨ 기능

### 🔍 예약 현황 조회 — `/dreamplus:status`

회의실 예약 현황을 ASCII 타임바로 보여줍니다. **회의실을 특정하면** 그 방 하루 타임바, **층·시간대·정원**으로 물으면 여러 회의실 그리드로 자동 분기합니다.

```
"드림플러스 7층 예약현황"   "내일 오후 비어있는 6인실"   "2H 타임바"   "11A 오늘 언제 비어?"
```

<br>

### ✅ 예약 — `/dreamplus:book`

원하는 조건으로 예약합니다. 불가하면 **가까운 층의 빈 회의실**을 제안합니다. (포인트 차감 — 실행 전 확인)

```
"내일 14시 6인실 예약해줘"   "2H 오늘 3시 30분 예약"
```

<br>

### 🗑️ 예약 취소 — `/dreamplus:cancel`

내 예약을 취소합니다. (시작 30분 전까지, 같은 날 취소 시 포인트 환불)

```
"2H 3시 예약 취소해줘"   "방금 그 예약 취소"
```

---

## 🔧 동작 원리

Node 스크립트(`bin/`)가 드림플러스 API를 직접 호출합니다. 외부 의존성은 0개입니다.

1. `~/.dreamplus/credentials`의 계정으로 로그인 → JWT 획득
   (비밀번호는 서버 공개키로 RSA 암호화해서 전송합니다. 웹 로그인 페이지와 동일한 방식)
2. 발급된 토큰은 `~/.dreamplus/session.json`에 캐시하고, 만료되면 자동으로 다시 로그인합니다
3. 예약 데이터 + 커밋된 회의실 카탈로그(`data/rooms.catalog.json`)를 하나의 `Board`로 정규화 → 조회·예약·취소가 공유
4. 예약/취소는 기본이 dry-run이고, **사용자 확인 후 `--confirm`이 붙을 때만** 실제로 실행됩니다

API 규격: [`docs/api.md`](docs/api.md) · 설계 문서: [`docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md`](docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md)

---

## 🔐 계정 정보는 어디에 저장되나요

솔직하게 적습니다. **비밀번호가 로컬 디스크에 평문으로 저장됩니다.**

| 파일 | 내용 | 권한 |
|---|---|---|
| `~/.dreamplus/credentials` | 이메일, **비밀번호 평문** | `600` (본인만 읽기) |
| `~/.dreamplus/session.json` | 발급받은 JWT·refreshToken | `600` |

- 두 파일 모두 **레포 바깥**(홈 디렉터리)에 있고, 레포에는 계정 정보가 전혀 들어가지 않습니다.
- 비밀번호는 **전송 시에만** RSA로 암호화됩니다. 저장은 평문입니다 — 서버 로그인에 원문이 필요하기 때문입니다.
- 디스크 암호화(FileVault 등)가 켜져 있는 기기에서 쓰는 것을 권장합니다.
- 쓰지 않게 되면 `rm -rf ~/.dreamplus`로 지우면 됩니다. 세션만 지우려면 `node bin/login.mjs --logout`.

> 이전 버전은 claude-in-chrome 확장으로 Chrome 세션의 토큰을 빌려 써서 비밀번호를 저장하지 않았습니다.
> 대신 모든 조회마다 브라우저를 왕복해야 해서 느렸고, 확장 설치가 필수였습니다.
> **속도와 설치 편의를 위해 비밀번호 보관을 택한 것**이니, 이 트레이드오프가 맞지 않으면 쓰지 마세요.

---

## ⚠️ 주의사항

- **포인트**: 예약 완료 시 즉시 차감 (30분당 10,000 / 20,000P)
- **취소**: 시작 30분 전까지, 같은 날 취소 시에만 환불
- **운영시간**: 08:00 ~ 21:00, 30분 단위
- **비밀번호 5회 실패 시 계정이 잠깁니다.** 스크립트는 로그인을 절대 자동 재시도하지 않으니, 로그인 실패가 뜨면 `~/.dreamplus/credentials`의 비밀번호부터 확인하세요
