#!/usr/bin/env node
// 예약 현황 조회 — 멀티 회의실 타임바 그리드
// 브라우저가 fetch한 예약 배열(JSON)을 stdin으로 받는다. 토큰/네트워크 없음.
// usage: <reservations.json | node bin/status.mjs [date] [--floor N] [--cap N] [--start HH:mm] [--end HH:mm] [--myid ID]

import { parseArgs, boardFromStdin, myId, today, run } from '../lib/cli.mjs';
import { renderStatus } from '../lib/render.mjs';
import { normalizeDate } from '../lib/time.mjs';

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const date = normalizeDate(a.date || a._[0] || today());
  const my = a.myid != null ? Number(a.myid) : myId();

  const board = await boardFromStdin(date, my);
  const filters = {};
  if (a.floor != null) filters.floor = Number(a.floor);
  if (a.cap != null) filters.minCap = Number(a.cap);
  if (a.start && a.end) {
    filters.start = a.start;
    filters.end = a.end;
  }
  console.log(renderStatus(board, filters));
});
