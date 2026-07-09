# 드림플러스 회의실 예약 스킬 (dreamplus-res)

드림플러스 강남 회의실을 **Claude Code 대화창에서** 조회·예약·취소하는 스킬 모음(플러그인)입니다. `"내일 오후 6인실 예약해줘"`처럼 자연어로 말하면 Chrome 로그인 세션에서 토큰을 자동으로 사용해 처리하고, 예약이 꽉 찼으면 **가까운 층의 빈 회의실**을 안내합니다.

---

## 📌 메인 담당자

- **이름**: Liam  
- **이메일**: Liam@everex.co.kr

---

## 🛠️ 설치 및 실행 방법

**전제조건**: [Claude Code](https://claude.com/claude-code), **claude-in-chrome** 확장, Chrome에서 [드림플러스 강남](https://gangnam.dreamplus.asia) 로그인, Node.js 18+

Claude Code에서 아래를 **각각 따로** 실행합니다(두 줄을 한 번에 붙여넣지 마세요 — 마켓플레이스 소스 입력창에 두 명령이 합쳐져 실패합니다).

**1 마켓플레이스 추가**

```
/plugin marketplace add everex-ai/mlops-dreamplus-reservation-skill
```

**2 플러그인 설치**

```
/plugin install dreamplus@everex-dreamplus
```


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

**토큰은 브라우저 밖으로 나가지 않습니다.** Chrome이 인증 네트워크를 담당하고, Node 스크립트(`bin/`)는 순수 렌더/판단만 합니다.

1. claude-in-chrome이 `sessionStorage.meInfo.jwtToken`으로 예약을 in-page fetch → **민감정보 제거한 데이터만** 반환
2. 그 데이터 + 커밋된 회의실 카탈로그(`data/rooms.catalog.json`)를 Node가 하나의 `Board`로 정규화 → 조회·예약·취소가 공유
3. 예약/취소 같은 쓰기는 사용자 확인 후 브라우저에서 실행

설계 문서: [`docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md`](docs/superpowers/specs/2026-07-09-dreamplus-reservation-skills-design.md) · 런타임 절차: [`docs/skill-runtime.md`](docs/skill-runtime.md)

---

## 🧪 개발 · 테스트

```bash
npm test        # 또는: node --test  — 순수 로직 단위 테스트(실측 응답 픽스처 기반)
```

회의실 구성이 바뀌면 카탈로그 재생성: 브라우저의 `/api2/meetingrooms` 결과를 `node bin/refresh-catalog.mjs`에 파이프.

---

## ⚠️ 주의사항

- **포인트**: 예약 완료 시 즉시 차감 (30분당 10,000 / 20,000P)
- **취소**: 시작 30분 전까지, 같은 날 취소 시에만 환불
- **운영시간**: 08:00 ~ 21:00, 30분 단위
- 개인정보·토큰은 코드에 저장하지 않고 매번 로그인 세션에서 읽습니다
