#!/usr/bin/env node
// 예약 — 가능하면 예약하고, 불가하면 가까운 빈 회의실을 제안한다.
//
// 기본은 dry-run(계획만 출력)이고, --confirm 이 있을 때만 실제로 예약한다.
// 포인트가 즉시 차감되므로 스킬은 사용자 확인을 받은 뒤에만 --confirm 을 붙인다.
//
// 요청한 회의실이 차 있으면 --confirm 이 있어도 예약하지 않는다.
// 대안 예약은 사용자가 회의실을 고른 뒤 그 회의실로 다시 실행해야 한다.
//
// usage: node bin/book.mjs <room> <start> [end] [--date d] [--title t] [--cap N] [--confirm]

import { parseArgs, fetchBoard, today, run } from '../lib/cli.mjs';
import { withAuth } from '../lib/auth.mjs';
import { createReservation } from '../lib/api.mjs';
import { resolveRoom, isFree, nearestFreeRooms } from '../lib/board.mjs';
import { normalizeDate, addMinutes, weekday } from '../lib/time.mjs';

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
  if (!query || !start) return fail('사용법: node bin/book.mjs <회의실> <시작 HH:mm> [종료] [--title 제목] [--confirm]');
  const end = a.end || a._[2] || addMinutes(start, 30);
  const date = normalizeDate(a.date || today());
  const title = a.title || '회의';

  if (toMin(start) >= toMin(end)) return fail('종료 시간이 시작 시간보다 빨라요.');
  if (toMin(start) < OPEN || toMin(end) > CLOSE) return fail('운영시간은 08:00~21:00 입니다.');

  await withAuth(async (token, session) => {
    const board = await fetchBoard(token, date, session.myId);
    const room = resolveRoom(board, query);
    if (!room) return fail(`회의실을 찾을 수 없습니다: ${query}`);

    const when = `${date.replace(/\./g, '-')}(${weekday(date)}) ${start}–${end}`;
    const price = commas(cost(room, start, end));

    // ── 요청한 회의실이 비어 있는 경우 ────────────────────────────────────
    if (isFree(board, room.roomCode, start, end)) {
      console.log(`🟢 예약 가능 — ${short(room)} (${room.floor}F · ${room.cap}인) · ${when} · ${price}P 차감`);
      if (!a.confirm) {
        console.log(`   확인 후 실행: --confirm 을 붙여 다시 실행하세요.`);
        return;
      }
      await createReservation(token, { roomCode: room.roomCode, date, start, end, title }, undefined);
      console.log(`✅ 예약 완료 — ${short(room)} · ${when} · "${title}" · ${price}P 차감`);
      return;
    }

    // ── 차 있는 경우: 대안만 제시하고 예약하지 않는다 ─────────────────────
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
    console.log(`   원하는 회의실로 다시 실행하세요. 예: node bin/book.mjs ${short(near[0])} ${start} ${end} --date ${date}`);
  });
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
