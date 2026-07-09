#!/usr/bin/env node
// 예약 취소 판단 — 내 예약 중 대상을 특정해 취소 액션 emit.
// 실제 삭제는 스킬이 브라우저에서 DELETE 수행. Node는 대상 선택만.
// 입력(stdin): 내 예약 배열(브라우저가 memberId로 필터). 없으면 취소할 예약 없음.
// usage: <my-reservations.json | node bin/cancel.mjs [<room> [start]] [--id N] [--date d] [--myid ID]
//
// 출력 마지막 줄: @@ACTION@@ cancel {"id":N}  (대상 1개 확정 시) — 스킬이 DELETE /api2/meetingroom/reservation

import { parseArgs, boardFromStdin, myId, today, run } from '../lib/cli.mjs';
import { resolveRoom, myReservations } from '../lib/board.mjs';
import { normalizeDate, weekday } from '../lib/time.mjs';

const short = (name) => name.replace(/^Meeting Room /, '');
const fmt = (m, date) => `${short(m.name)} · ${date.replace(/\./g, '-')}(${weekday(date)}) ${m.start}–${m.end} · "${m.title}" (id ${m.id})`;

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const date = normalizeDate(a.date || today());
  const roomQuery = a.room || a._[0];
  const start = a.start || a._[1];
  const my = a.myid != null ? Number(a.myid) : myId();

  const board = await boardFromStdin(date, my);
  const mine = myReservations(board);
  if (mine.length === 0) {
    console.log(`${date.replace(/\./g, '-')}에 취소할 내 예약이 없습니다.`);
    return;
  }

  let targets = mine;
  if (a.id != null) {
    targets = mine.filter((m) => String(m.id) === String(a.id));
  } else if (roomQuery) {
    const rm = resolveRoom(board, roomQuery);
    targets = mine.filter((m) => rm && m.roomCode === rm.roomCode);
    if (start) targets = targets.filter((m) => m.start === start);
  }

  if (targets.length === 0) {
    console.log('조건에 맞는 내 예약을 찾지 못했습니다. 오늘 내 예약:');
    for (const m of mine) console.log(`   • ${fmt(m, date)}`);
    return;
  }
  if (targets.length > 1) {
    console.log('취소 대상이 여러 개입니다. --id 로 특정해 주세요:');
    for (const m of targets) console.log(`   • ${fmt(m, date)}`);
    return;
  }

  const t = targets[0];
  console.log(`🗑️  취소 대상 — ${fmt(t, date)}`);
  console.log(`@@ACTION@@ cancel ${JSON.stringify({ id: t.id })}`);
});
