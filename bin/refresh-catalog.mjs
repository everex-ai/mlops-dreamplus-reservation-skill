#!/usr/bin/env node
// 회의실 카탈로그 재생성 — 방 구성(정원/장비/신설)이 바뀌었을 때만.
// 브라우저가 fetch한 /api2/meetingrooms 결과(JSON)를 stdin으로 받아 data/rooms.catalog.json에 쓴다.
// usage: <meetingrooms.json | node bin/refresh-catalog.mjs

import { writeFileSync } from 'node:fs';
import { readStdin, run } from '../lib/cli.mjs';

run(async () => {
  const raw = (await readStdin()).trim();
  if (!raw) {
    console.error('입력이 없습니다. 브라우저의 /api2/meetingrooms 결과를 파이프로 넘기세요.');
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.list || [];
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
