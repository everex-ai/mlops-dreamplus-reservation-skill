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

/** 26칸 예약/가능 바. █=예약, ░=가능 */
export function slotBar(room) {
  const cells = new Array(CELLS).fill('░');
  for (const b of room.busy) {
    const s = Math.max(0, slotIndex(b.start));
    const e = Math.min(CELLS, slotIndex(b.end));
    for (let i = s; i < e; i++) cells[i] = '█';
  }
  return cells.join('');
}

/** View A — 단일 회의실 */
export function renderTimebar(board, roomCode) {
  const room = board.rooms.find((r) => r.roomCode === roomCode);
  if (!room) return `회의실을 찾을 수 없습니다: ${roomCode}`;
  const wd = weekday(board.date);
  const lines = [
    `${room.name} · ${room.floor}F · ${room.cap}인 · ${commas(room.point)}P/30분 · ${fmtDate(board.date)}(${wd})`,
    RULER,
    `${slotBar(room)}   █예약 ░가능`,
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

/** View B — 멀티 회의실 그리드. filters: {floor, minCap, start, end} */
export function renderStatus(board, filters = {}) {
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
    lines.push(`${padDisp(shortName(room), LBLW)}${slotBar(room)}  ${meta}`);
  }
  if (rooms.length === 0) lines.push('(조건에 맞는 회의실 없음)');
  return lines.join('\n');
}
