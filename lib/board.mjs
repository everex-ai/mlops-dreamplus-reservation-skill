// Board: 특정 날짜의 회의실 + 예약을 하나로 정규화한 데이터 구조.
// 모든 뷰(timebar/status)와 동작(book/cancel)이 이 구조를 공유한다.
//
//   { date, rooms: [ { roomCode, name, floor, cap, point, equipment,
//                      busy: [{start:'HH:mm', end:'HH:mm', title, mine}],
//                      free: [{start:'HH:mm', end:'HH:mm'}] } ] }

const OPEN = '08:00';
const CLOSE = '21:00';

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHmm = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 순수 정규화: fetch 결과(rooms, reservations)를 Board로 변환 */
export function normalizeBoard(rooms, reservations, date, myId) {
  const byRoom = new Map();
  for (const r of reservations) {
    if (!byRoom.has(r.roomCode)) byRoom.set(r.roomCode, []);
    byRoom.get(r.roomCode).push(r);
  }

  const boardRooms = rooms.map((room) => {
    const busy = (byRoom.get(room.roomCode) || [])
      .map((r) => ({
        start: String(r.startTime).slice(11, 16),
        end: String(r.endTime).slice(11, 16),
        title: r.title || '',
        mine: myId != null && Number(r.memberId) === Number(myId),
      }))
      .sort((a, b) => toMin(a.start) - toMin(b.start));

    return {
      roomCode: room.roomCode,
      name: room.roomName,
      floor: room.floor,
      cap: room.maxMember,
      point: room.point,
      equipment: room.equipment,
      busy,
      free: freeIntervals(busy),
    };
  });

  return { date, rooms: boardRooms };
}

/** busy 구간의 여집합(운영시간 내)을 free 구간으로 */
function freeIntervals(busy) {
  const open = toMin(OPEN);
  const close = toMin(CLOSE);
  // 병합
  const merged = [];
  for (const b of [...busy].sort((a, z) => toMin(a.start) - toMin(z.start))) {
    const s = Math.max(toMin(b.start), open);
    const e = Math.min(toMin(b.end), close);
    if (e <= s) continue;
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  const free = [];
  let cursor = open;
  for (const [s, e] of merged) {
    if (s > cursor) free.push({ start: toHHmm(cursor), end: toHHmm(s) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < close) free.push({ start: toHHmm(cursor), end: toHHmm(close) });
  return free;
}

const findRoom = (board, roomCode) =>
  board.rooms.find((r) => r.roomCode === roomCode) || null;

/** [start,end) 구간이 해당 방에서 비어있는지 */
export function isFree(board, roomCode, start, end) {
  const room = findRoom(board, roomCode);
  if (!room) return false;
  const s = toMin(start);
  const e = toMin(end);
  return !room.busy.some((b) => toMin(b.start) < e && s < toMin(b.end));
}

/** 코드 / 짧은이름('2H') / 전체이름으로 방 찾기 */
export function resolveRoom(board, query) {
  if (query == null) return null;
  if (typeof query === 'number' || /^\d+$/.test(String(query).trim())) {
    return findRoom(board, Number(query));
  }
  const q = String(query).trim().toLowerCase();
  return (
    board.rooms.find((r) => r.name.toLowerCase() === q) ||
    board.rooms.find((r) => r.name.toLowerCase().endsWith(' ' + q)) ||
    board.rooms.find((r) => r.name.toLowerCase().endsWith(q)) ||
    null
  );
}

/** 대상 방/층 기준, [start,end)에 비어있는 방을 가까운 순으로 */
export function nearestFreeRooms(board, { roomCode, floor, start, end, minCap = 1 }) {
  const target = roomCode != null ? findRoom(board, roomCode) : null;
  const targetFloor = target ? target.floor : floor;
  return board.rooms
    .filter(
      (r) =>
        r.roomCode !== (target && target.roomCode) &&
        r.cap >= minCap &&
        isFree(board, r.roomCode, start, end),
    )
    .sort(
      (a, b) =>
        Math.abs(a.floor - targetFloor) - Math.abs(b.floor - targetFloor) ||
        a.floor - b.floor ||
        a.roomCode - b.roomCode,
    );
}

/**
 * 네트워크: 예약만 fetch하고, 회의실 목록은 커밋된 카탈로그를 사용.
 * (카탈로그를 갱신하려면 rooms 옵션으로 라이브 목록을 주입)
 */
export async function buildBoard(token, date, { myId, rooms } = {}) {
  const { getReservations } = await import('./api.mjs');
  const { loadCatalog } = await import('./catalog.mjs');
  const [reservations, roomList] = await Promise.all([
    getReservations(token, date),
    rooms ? Promise.resolve(rooms) : loadCatalog(),
  ]);
  return normalizeBoard(roomList, reservations, date, myId);
}
