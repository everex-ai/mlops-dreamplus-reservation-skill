#!/usr/bin/env node
// 단일 회의실 타임바
// 브라우저가 fetch한 예약 배열(JSON)을 stdin으로 받는다. 토큰/네트워크 없음.
// usage: <reservations.json | node bin/timebar.mjs <room> [date] [--myid ID]

import { parseArgs, boardFromStdin, myId, today, run } from '../lib/cli.mjs';
import { resolveRoom } from '../lib/board.mjs';
import { renderTimebar } from '../lib/render.mjs';
import { normalizeDate } from '../lib/time.mjs';

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const query = a.room || a._[0];
  if (!query) {
    console.error('회의실을 지정하세요. 예: node bin/timebar.mjs 2H');
    process.exit(1);
  }
  const date = normalizeDate(a.date || a._[1] || today());
  const my = a.myid != null ? Number(a.myid) : myId();

  const board = await boardFromStdin(date, my);
  const room = resolveRoom(board, query);
  if (!room) {
    console.error(`회의실을 찾을 수 없습니다: ${query}`);
    process.exit(1);
  }
  console.log(renderTimebar(board, room.roomCode));
});
