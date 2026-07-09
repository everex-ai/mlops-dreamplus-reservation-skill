import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBoard } from '../lib/board.mjs';
import { slotBar, RULER, renderTimebar, renderStatus } from '../lib/render.mjs';

const rooms = JSON.parse(readFileSync(new URL('./fixtures/rooms.json', import.meta.url)));
const reservations = JSON.parse(
  readFileSync(new URL('./fixtures/reservations-2026.07.09.json', import.meta.url)),
);
const board = normalizeBoard(rooms, reservations, '2026.07.09', 107858);
const room = (c) => board.rooms.find((r) => r.roomCode === c);

test('slotBar renders 26 cells, █ for booked and ░ for free', () => {
  // 2A: busy 10-14 (slots 4-11) and 17-19 (slots 18-21)
  assert.equal(slotBar(room(201)), '░░░░████████░░░░░░████░░░░');
  assert.equal(slotBar(room(201)).length, 26);
});

test('slotBar of a fully-free room is all ░', () => {
  assert.equal(slotBar(room(204)), '░'.repeat(26));
});

test('slotBar of a fully-booked room is all █', () => {
  assert.equal(slotBar(room(203)), '█'.repeat(26));
});

test('color mode gives adjacent reservations distinct colors, stripping to the mono bar', () => {
  // 붙어있는 두 예약: 13:00-16:00, 16:00-18:00 (사이 공백 없음)
  const adj = normalizeBoard(
    [{ roomCode: 999, roomName: 'Meeting Room 9Z', floor: 9, maxMember: 4, equipment: '', point: 10000 }],
    [
      { id: 1, roomCode: 999, startTime: '2026.07.09 13:00', endTime: '2026.07.09 16:00', title: 'a', memberId: 1 },
      { id: 2, roomCode: 999, startTime: '2026.07.09 16:00', endTime: '2026.07.09 18:00', title: 'b', memberId: 1 },
    ],
    '2026.07.09',
    0,
  );
  const r = adj.rooms[0];
  const mono = slotBar(r);
  const col = slotBar(r, { color: true });
  assert.match(col, /\x1b\[/); // has ANSI
  const codes = new Set([...col.matchAll(/\x1b\[\d+m/g)].map((m) => m[0]).filter((c) => c !== '\x1b[0m'));
  assert.ok(codes.size >= 2, 'adjacent blocks should use >=2 distinct colors');
  // ANSI를 제거하면 단색 바와 동일해야 함
  assert.equal(col.replace(/\x1b\[[0-9;]*m/g, ''), mono);
});

test('mono mode is unaffected (default)', () => {
  assert.equal(slotBar(room(201)), '░░░░████████░░░░░░████░░░░'); // no ANSI
  assert.ok(!/\x1b/.test(slotBar(room(201))));
});

test('shade mode alternates █/▓ per reservation, markdown-safe (no ANSI)', () => {
  const adj = normalizeBoard(
    [{ roomCode: 999, roomName: 'Meeting Room 9Z', floor: 9, maxMember: 4, equipment: '', point: 10000 }],
    [
      { id: 1, roomCode: 999, startTime: '2026.07.09 13:00', endTime: '2026.07.09 16:00', title: 'a', memberId: 1 },
      { id: 2, roomCode: 999, startTime: '2026.07.09 16:00', endTime: '2026.07.09 18:00', title: 'b', memberId: 1 },
    ],
    '2026.07.09',
    0,
  );
  const bar = slotBar(adj.rooms[0], { shade: true });
  assert.ok(!/\x1b/.test(bar)); // 마크다운 안전(ANSI 없음)
  // 첫 예약(13-16, 슬롯10-15)=█, 둘째(16-18, 슬롯16-19)=▓ → 경계가 보임
  assert.equal(bar, '░░░░░░░░░░██████▓▓▓▓░░░░░░');
});

test('shade mode keeps a single reservation as clean █', () => {
  // 2H fixture: 종일 free이므로 예약 있는 2C(종일)로 확인 → 단일 예약은 █만
  const oneRes = normalizeBoard(
    [{ roomCode: 999, roomName: 'Meeting Room 9Z', floor: 9, maxMember: 4, equipment: '', point: 10000 }],
    [{ id: 1, roomCode: 999, startTime: '2026.07.09 10:00', endTime: '2026.07.09 12:00', title: 'a', memberId: 1 }],
    '2026.07.09',
    0,
  );
  assert.equal(slotBar(oneRes.rooms[0], { shade: true }), '░░░░████░░░░░░░░░░░░░░░░░░');
});

test('RULER aligns to the 26-cell bar', () => {
  assert.equal(RULER, '08  10  12  14  16  18  20');
  assert.equal(RULER.length, 26);
});

test('renderTimebar shows the room, the bar, and each reservation', () => {
  const out = renderTimebar(board, 201);
  assert.match(out, /Meeting Room 2A/);
  assert.ok(out.includes('░░░░████████░░░░░░████░░░░'));
  assert.match(out, /10:00.?14:00/);
  assert.match(out, /온보딩세션/);
  assert.match(out, /17:00.?19:00/);
  assert.match(out, /팀 회의/);
});

test('renderStatus filtered to a floor lists only that floor, one bar per room', () => {
  const out = renderStatus(board, { floor: 2 });
  assert.ok(out.includes(RULER));
  assert.match(out, /\b2A\b/);
  assert.match(out, /\b2D\b/);
  assert.ok(!/\b3A\b/.test(out)); // floor 3 excluded
  // fully-free 2D row contains an all-free bar
  assert.ok(out.includes('░'.repeat(26)));
});
