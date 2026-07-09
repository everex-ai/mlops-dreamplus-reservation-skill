// bin/* 공용 헬퍼: 인자 파싱 + 토큰/회원ID 로딩.
// 하이브리드 모델 — 토큰은 스킬이 Chrome에서 추출해 DP_TOKEN 환경변수로 넘긴다.

/** 초경량 argv 파서: 위치인자는 _, --key value, 끝의 --flag는 true */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

/** stdin 전체를 읽어 문자열로 반환 */
export async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * 예약 데이터를 입력에서 로드해 Board 생성 (네트워크·토큰 없음).
 * 브라우저가 토큰으로 fetch한 예약 배열을 stdin(JSON)으로 넘긴다.
 * 형식: [{id, roomCode, startTime, endTime, title, memberId}, ...]
 */
export async function boardFromStdin(date, myId) {
  const { normalizeBoard, expandReservations } = await import('./board.mjs');
  const { loadCatalog } = await import('./catalog.mjs');
  const raw = (await readStdin()).trim();
  let items = [];
  if (raw) {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : parsed.list || [];
  }
  return normalizeBoard(loadCatalog(), expandReservations(items, date), date, myId);
}

/** DP_TOKEN 필수. 없으면 스킬을 통해 실행하라고 안내 후 종료(코드 2) */
export function requireToken() {
  const t = process.env.DP_TOKEN;
  if (!t) {
    console.error('DP_TOKEN이 없습니다. 스킬을 통해 실행하세요 (드림플러스 로그인 필요).');
    process.exit(2);
  }
  return t;
}

/** 현재 회원 id (내 예약 구분용). 없으면 null */
export function myId() {
  return process.env.DP_MY_ID ? Number(process.env.DP_MY_ID) : null;
}

/** 토큰 만료 시 스킬이 감지하도록 약속된 종료코드 */
export const EXIT_TOKEN_EXPIRED = 3;

/** 오늘 'YYYY.MM.DD' (로컬) */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** TokenExpiredError를 EXIT_TOKEN_EXPIRED로 변환하는 실행 래퍼 */
export async function run(main) {
  try {
    await main();
  } catch (e) {
    if (e && e.name === 'TokenExpiredError') {
      console.error('TOKEN_EXPIRED');
      process.exit(EXIT_TOKEN_EXPIRED);
    }
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  }
}
