# 드림플러스 회의실 예약 스킬 (dreamplus-res)

드림플러스 강남 회의실을 **Claude Code 대화창에서** 조회·시각화·예약·취소하는 스킬 모음입니다. `"내일 오후 6인실 예약해줘"`처럼 자연어로 말하면 Chrome 로그인 세션에서 토큰을 자동 추출해 처리하고, 예약이 꽉 찼으면 **가까운 층의 빈 회의실**을 안내합니다.

---

## 📌 메인 담당자

- **이름**: Liam  
- **이메일**: Liam@everex.co.kr

---

## 🛠️ 설치 및 실행 방법

**전제조건**: [Claude Code](https://claude.com/claude-code), **claude-in-chrome** 확장, Chrome에서 [드림플러스 강남](https://gangnam.dreamplus.asia) 로그인, Node.js 18+

```bash
git clone <이 레포 URL>
cd dreamplus-res

# 스킬을 전역으로 쓰려면 복사 (레포를 열어 쓰면 프로젝트 스코프로 자동 인식)
cp -r .claude/skills/dreamplus-* ~/.claude/skills/
```

Claude Code 대화창에 자연어로 말하면 됩니다. 로그인이 안 되어 있으면 로그인하라고 안내합니다.

---

## ✨ 기능

### 🔍 예약 현황 조회 — `dreamplus-status`

날짜·층·시간대·정원으로 비어있는 회의실을 찾아 멀티 회의실 타임바로 보여줍니다.

```
"내일 오후 비어있는 회의실 보여줘"   "7층 오늘 예약현황"   "6인실 3시 가능?"
```

<!-- 📹 데모 GIF 추가 예정 -->

<br>

### 📊 회의실 타임바 — `dreamplus-timebar`

한 회의실의 하루 예약/가능 시간을 ASCII 바로 한눈에 보여줍니다.

```
"2H 오늘 타임바"   "Meeting Room 11A 내일 예약 현황"
```

<!-- 📹 데모 GIF 추가 예정 -->

<br>

### ✅ 예약 — `dreamplus-book`

원하는 조건으로 예약합니다. 불가하면 **가까운 층의 빈 회의실**을 제안합니다. (포인트 차감 — 실행 전 확인)

```
"내일 14시 6인실 예약해줘"   "2H 오늘 3시 30분 예약"
```

<!-- 📹 데모 GIF 추가 예정 -->

<br>

### 🗑️ 예약 취소 — `dreamplus-cancel`

내 예약을 취소합니다. (시작 30분 전까지, 같은 날 취소 시 포인트 환불)

```
"2H 3시 예약 취소해줘"   "방금 그 예약 취소"
```

<!-- 📹 데모 GIF 추가 예정 -->

---

## 🔧 동작 원리

**하이브리드** — Chrome은 토큰 금고, 실제 API 호출은 Node 스크립트가 담당합니다.

1. claude-in-chrome으로 `sessionStorage.meInfo.jwtToken`을 신선하게 추출
2. 토큰을 환경변수로 Node 스크립트에 전달 → 드림플러스 REST API 직접 호출
3. 만료 시 탭 새로고침으로 앱이 자동 갱신 → 재추출

`buildBoard(token, date)`가 회의실+예약을 하나의 데이터 구조로 정규화하고, 조회·타임바·예약·취소가 모두 이 구조를 공유합니다. 설계 문서: [`docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md`](docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md)

---

## ⚠️ 주의사항

- **포인트**: 예약 완료 시 즉시 차감 (30분당 10,000 / 20,000P)
- **취소**: 시작 30분 전까지, 같은 날 취소 시에만 환불
- **운영시간**: 08:00 ~ 21:00, 30분 단위
- 개인정보·토큰은 코드에 저장하지 않고 매번 로그인 세션에서 읽습니다
