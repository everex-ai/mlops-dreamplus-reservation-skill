#!/usr/bin/env node
// 예약 취소 — 내 예약 중 대상을 특정해 취소한다.
//
// 기본은 dry-run(대상만 출력)이고, --confirm 이 있을 때만 실제로 취소한다.
// 대상이 2개 이상이면 --confirm 이 있어도 취소하지 않고 목록만 보여준다.
//
// usage: node bin/cancel.mjs [<room> [start]] [--id N] [--date d] [--confirm]

import { parseArgs, fetchBoard, today, run } from '../lib/cli.mjs';
import { withAuth } from '../lib/auth.mjs';
import { cancelReservation } from '../lib/api.mjs';
import { resolveRoom, myReservations } from '../lib/board.mjs';
import { normalizeDate, weekday } from '../lib/time.mjs';

const short = (name) => name.replace(/^Meeting Room /, '');
const fmt = (m, date) => `${short(m.name)} · ${date.replace(/\./g, '-')}(${weekday(date)}) ${m.start}–${m.end} · "${m.title}" (id ${m.id})`;

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const date = normalizeDate(a.date || today());
  const roomQuery = a.room || a._[0];
  const start = a.start || a._[1];

  await withAuth(async (token, session) => {
    const board = await fetchBoard(token, date, session.myId);
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
      console.log('조건에 맞는 내 예약을 찾지 못했습니다. 이 날짜의 내 예약:');
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
    if (!a.confirm) {
      console.log('   확인 후 실행: --confirm 을 붙여 다시 실행하세요.');
      return;
    }
    await cancelReservation(token, t.id, undefined);
    console.log(`✅ 취소 완료 — ${fmt(t, date)}`);
    console.log('   (같은 날 취소면 포인트가 환불됩니다.)');
  });
});
