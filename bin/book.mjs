#!/usr/bin/env node
// 예약 판단 — 가능하면 예약 액션 emit, 불가하면 가까운 빈 회의실 제안.
// 실제 쓰기는 스킬이 브라우저에서 수행(토큰 보유). Node는 판단만.
// 입력(stdin): [start,end)에 겹치는 예약 배열(전 회의실). 없으면 전부 비어있는 것으로 간주.
// usage: <reservations.json | node bin/book.mjs <room> <start> [end] [--date d] [--title t] [--cap N] [--myid ID]
//
// 출력 마지막 줄: @@ACTION@@ book {payload}  (가능 시)  — 스킬이 이 payload로 POST /api2/meetingroom/reservation

import { parseArgs, boardFromStdin, myId, today, run } from '../lib/cli.mjs';
import { resolveRoom, isFree, nearestFreeRooms } from '../lib/board.mjs';
import { normalizeDate, addMinutes, weekday, toApiDateTime } from '../lib/time.mjs';

const OPEN = 8 * 60;
const CLOSE = 21 * 60;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const short = (r) => r.name.replace(/^Meeting Room /, '');
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const cost = (room, s, e) => ((toMin(e) - toMin(s)) / 30) * room.point;

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const query = a.room || a._[0];
  const start = a.start || a._[1];
  if (!query || !start) return fail('사용법: node bin/book.mjs <회의실> <시작 HH:mm> [종료] [--title 제목]');
  const end = a.end || a._[2] || addMinutes(start, 30);
  const date = normalizeDate(a.date || today());
  const title = a.title || '회의';
  const my = a.myid != null ? Number(a.myid) : myId();

  if (toMin(start) >= toMin(end)) return fail('종료 시간이 시작 시간보다 빨라요.');
  if (toMin(start) < OPEN || toMin(end) > CLOSE) return fail('운영시간은 08:00~21:00 입니다.');

  const board = await boardFromStdin(date, my);
  const room = resolveRoom(board, query);
  if (!room) return fail(`회의실을 찾을 수 없습니다: ${query}`);

  const when = `${date.replace(/\./g, '-')}(${weekday(date)}) ${start}–${end}`;

  if (isFree(board, room.roomCode, start, end)) {
    console.log(`🟢 예약 가능 — ${short(room)} (${room.floor}F · ${room.cap}인) · ${when} · ${commas(cost(room, start, end))}P 차감`);
    emit('book', {
      roomCode: room.roomCode,
      startTime: toApiDateTime(date, start),
      endTime: toApiDateTime(date, end),
      title,
    });
    return;
  }

  const minCap = a.cap != null ? Number(a.cap) : room.cap;
  const near = nearestFreeRooms(board, { roomCode: room.roomCode, start, end, minCap }).slice(0, 5);
  console.log(`🔴 예약 불가 — ${short(room)} · ${when} 은 이미 예약이 있습니다.`);
  if (near.length === 0) {
    console.log('   같은 시간대에 조건(정원)에 맞는 빈 회의실이 없습니다.');
    return;
  }
  console.log(`   가까운 빈 회의실 (정원 ${minCap}인 이상):`);
  for (const r of near) {
    const d = Math.abs(r.floor - room.floor);
    console.log(`   • ${short(r)} — ${r.floor}F(${d === 0 ? '같은 층' : d + '층 차이'}) · ${r.cap}인 · ${commas(cost(r, start, end))}P`);
  }
  const best = near[0];
  emit('book', {
    roomCode: best.roomCode,
    startTime: toApiDateTime(date, start),
    endTime: toApiDateTime(date, end),
    title,
  });
});

function emit(kind, payload) {
  console.log(`@@ACTION@@ ${kind} ${JSON.stringify(payload)}`);
}
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
