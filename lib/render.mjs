// Board → ASCII 렌더. 순수 함수(네트워크 모름). 08:00~21:00을 30분 26칸으로.
//   renderTimebar: 단일 회의실 (View A)
//   renderStatus : 멀티 회의실 그리드 (View B)

import { slotIndex, weekday, padDisp } from './time.mjs';
import { isFree } from './board.mjs';

const CELLS = 26;
export const RULER = '08  10  12  14  16  18  20'; // 2시간(4칸)마다 라벨, 총 26칸

const shortName = (room) => room.name.replace(/^Meeting Room /, '');
const fmtDate = (date) => date.replace(/\./g, '-');
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const RESET = '\x1b[0m';
// 인접 예약 구분용 색 팔레트(굵은 전경). 예약 순번 % 길이 → 이웃끼리 항상 다른 색.
const PALETTE = ['\x1b[96m', '\x1b[95m', '\x1b[93m', '\x1b[92m', '\x1b[94m', '\x1b[91m'];

/** 각 슬롯의 소유 예약 인덱스(빈칸 -1) */
function slotOwners(room) {
  const owners = new Array(CELLS).fill(-1);
  room.busy.forEach((b, idx) => {
    const s = Math.max(0, slotIndex(b.start));
    const e = Math.min(CELLS, slotIndex(b.end));
    for (let i = s; i < e; i++) owners[i] = idx;
  });
  return owners;
}

/**
 * 26칸 예약/가능 바. █=예약, ░=가능.
 * - shade=true: 인접 예약을 █/▓ 교차(마크다운 안전, 예약 1개면 █ 그대로)
 * - color=true: 예약별 ANSI 색(터미널용). color가 shade보다 우선.
 */
export function slotBar(room, { color = false, shade = false } = {}) {
  const owners = slotOwners(room);
  if (!color) {
    return owners.map((o) => (o < 0 ? '░' : shade && o % 2 ? '▓' : '█')).join('');
  }
  let out = '';
  let cur = null;
  for (const o of owners) {
    if (o < 0) {
      if (cur !== null) { out += RESET; cur = null; }
      out += '░';
    } else {
      const c = PALETTE[o % PALETTE.length];
      if (c !== cur) { out += c; cur = c; }
      out += '█';
    }
  }
  if (cur !== null) out += RESET;
  return out;
}

/** View A — 단일 회의실 */
export function renderTimebar(board, roomCode, { color = false, shade = false } = {}) {
  const room = board.rooms.find((r) => r.roomCode === roomCode);
  if (!room) return `회의실을 찾을 수 없습니다: ${roomCode}`;
  const wd = weekday(board.date);
  const lines = [
    `${room.name} · ${room.floor}F · ${room.cap}인 · ${commas(room.point)}P/30분 · ${fmtDate(board.date)}(${wd})`,
    RULER,
    `${slotBar(room, { color, shade })}   █예약 ░가능`,
  ];
  if (room.busy.length === 0) {
    lines.push('· 종일 가능');
  } else {
    for (const b of room.busy) {
      lines.push(`· ${b.start}–${b.end}  ${b.title}${b.mine ? ' (내 예약)' : ''}`);
    }
  }
  return lines.join('\n');
}

/** View B — 멀티 회의실 그리드. filters: {floor, minCap, start, end, color} */
export function renderStatus(board, filters = {}) {
  const color = !!filters.color;
  const shade = !!filters.shade;
  let rooms = board.rooms;
  if (filters.floor != null) rooms = rooms.filter((r) => r.floor === filters.floor);
  if (filters.minCap) rooms = rooms.filter((r) => r.cap >= filters.minCap);
  if (filters.start && filters.end) {
    rooms = rooms.filter((r) => isFree(board, r.roomCode, filters.start, filters.end));
  }

  const LBLW = 5; // ASCII 방코드 라벨 고정폭 (한글 미포함 → 정렬 안전)
  const floorLabel = filters.floor != null ? `${filters.floor}F` : '전체 층';
  const lines = [
    `${fmtDate(board.date)}(${weekday(board.date)}) · ${floorLabel}`,
    ' '.repeat(LBLW) + RULER,
  ];
  for (const room of rooms) {
    const n = room.busy.length;
    const meta = `${room.cap}인 ${room.point / 1000}k · ${n ? '예약' + n : '종일가능'}`;
    lines.push(`${padDisp(shortName(room), LBLW)}${slotBar(room, { color, shade })}  ${meta}`);
  }
  if (rooms.length === 0) lines.push('(조건에 맞는 회의실 없음)');
  return lines.join('\n');
}
