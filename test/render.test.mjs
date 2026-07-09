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
