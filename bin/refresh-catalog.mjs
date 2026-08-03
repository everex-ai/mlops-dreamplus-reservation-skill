#!/usr/bin/env node
// 회의실 카탈로그 재생성 — 방 구성(정원/장비/신설)이 바뀌었을 때만 실행한다.
// /api2/meetingrooms 를 직접 조회해 data/rooms.catalog.json 에 쓴다.
// usage: node bin/refresh-catalog.mjs [--date YYYY.MM.DD]

import { writeFileSync } from 'node:fs';
import { parseArgs, today, run } from '../lib/cli.mjs';
import { withAuth } from '../lib/auth.mjs';
import { getRooms } from '../lib/api.mjs';
import { normalizeDate } from '../lib/time.mjs';

run(async () => {
  const a = parseArgs(process.argv.slice(2));
  const date = normalizeDate(a.date || today());

  const list = await withAuth((token) => getRooms(token, date));
  if (list.length === 0) {
    console.error('회의실 목록이 비어 있습니다. 카탈로그를 덮어쓰지 않았습니다.');
    process.exit(1);
  }

  const rooms = list
    .map((r) => ({
      roomCode: r.roomCode,
      roomName: r.roomName,
      floor: r.floor,
      maxMember: r.maxMember,
      equipment: r.equipment,
      point: r.point,
    }))
    .sort((a, b) => a.roomCode - b.roomCode);

  const out = { center: 'gangnam', generatedFrom: '/api2/meetingrooms', roomCount: rooms.length, rooms };
  writeFileSync(new URL('../data/rooms.catalog.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`카탈로그 갱신 완료: ${rooms.length}개 방 · 층 ${[...new Set(rooms.map((r) => r.floor))].join(',')}`);
});
