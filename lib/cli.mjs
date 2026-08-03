// bin/* 공용 헬퍼: 인자 파싱, Board 로딩, 실행 래퍼.
// 인증과 네트워크는 Node가 직접 담당한다(lib/auth.mjs → lib/api.mjs).
// 브라우저는 관여하지 않는다.

import { readFileSync } from 'node:fs';
import { withAuth, CredentialsError } from './auth.mjs';
import { getReservations } from './api.mjs';
import { normalizeBoard, expandReservations } from './board.mjs';
import { loadCatalog } from './catalog.mjs';

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

/** 토큰으로 하루치 예약을 받아 Board 생성 */
export async function fetchBoard(token, date, myId, fetchImpl) {
  const list = await getReservations(token, date, fetchImpl);
  return normalizeBoard(loadCatalog(), list, date, myId);
}

/** 예약 JSON 파일에서 Board 생성 — 오프라인 확인·테스트용(--fixture) */
export function boardFromFixture(file, date, myId = null) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const items = Array.isArray(parsed) ? parsed : parsed.list || [];
  return normalizeBoard(loadCatalog(), expandReservations(items, date), date, myId);
}

/**
 * 읽기 전용 스크립트용 Board 로딩.
 * --fixture가 있으면 네트워크 없이 파일에서, 없으면 로그인해서 조회한다.
 */
export async function loadBoard(date, { fixture, myId } = {}) {
  if (fixture) return boardFromFixture(fixture, date, myId ?? null);
  return withAuth((token, session) => fetchBoard(token, date, myId ?? session.myId));
}

/** 색상 사용 여부: --no-color/NO_COLOR면 끔, --color면 켬, 아니면 TTY일 때만 */
export function useColor(args) {
  if (process.env.NO_COLOR || args['no-color']) return false;
  if (args.color) return true;
  return !!process.stdout.isTTY;
}

/** 오늘 'YYYY.MM.DD' (로컬) */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 오류를 사람이 읽을 메시지로 정리하는 실행 래퍼 */
export async function run(main) {
  try {
    await main();
  } catch (e) {
    if (e instanceof CredentialsError) {
      console.error(e.message); // 설정 안내 — 스택은 노이즈다
      process.exit(2);
    }
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  }
}
