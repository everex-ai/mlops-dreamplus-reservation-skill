#!/usr/bin/env node
// 예약 현황 조회 — 멀티 회의실 타임바 그리드
// usage: node bin/status.mjs [date] [--floor N] [--cap N] [--start HH:mm] [--end HH:mm] [--fixture f]

import { parseArgs, loadBoard, today, useColor, run } from '../lib/cli.mjs';
import { renderStatus } from '../lib/render.mjs';
import { normalizeDate } from '../lib/time.mjs';

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const date = normalizeDate(a.date || a._[0] || today());

  const board = await loadBoard(date, {
    fixture: a.fixture,
    myId: a.myid != null ? Number(a.myid) : undefined,
  });

  const filters = { color: useColor(a), shade: !a['no-shade'] };
  if (a.floor != null) filters.floor = Number(a.floor);
  if (a.cap != null) filters.minCap = Number(a.cap);
  if (a.start && a.end) {
    filters.start = a.start;
    filters.end = a.end;
  }
  console.log(renderStatus(board, filters));
});
